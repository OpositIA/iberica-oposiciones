/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

type RequestPayload = {
  locale?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  password?: string;
  date_of_birth?: string;
  preferred_opposition_id?: string;
};

type UserMetadataPayload = {
  first_name: string;
  last_name: string;
  full_name: string;
  date_of_birth: string | null;
  preferred_opposition_id: string | null;
  preferred_opposition: string | null;
  locale: string;
};

const sanitizeText = (value: unknown, maxLength = Number.POSITIVE_INFINITY) => {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  )
    return "";

  let sanitized = String(value).replace(/[\u0000-\u001F\u007F]/g, "");
  sanitized = sanitized.replace(/\s+/g, " ").trim();

  if (Number.isFinite(maxLength) && maxLength >= 0)
    sanitized = sanitized.slice(0, maxLength);

  return sanitized;
};

const sanitizeSingleLineText = (value: unknown, maxLength = 200) =>
  sanitizeText(value, maxLength);

const sanitizeCode = (value: unknown, maxLength = 120) =>
  sanitizeSingleLineText(value, maxLength).replace(/[^A-Za-z0-9._:-]/g, "");

const parseJsonBody = async <T>(req: Request): Promise<T> => {
  const raw = await req.text();
  if (!raw.trim()) return {} as T;

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("Invalid JSON body");
  }
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });

const isEmailRateLimitError = (message: string) =>
  message.toLowerCase().includes("email rate limit exceeded");

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  const supabaseServiceRoleKey = Deno.env
    .get("SUPABASE_SERVICE_ROLE_KEY")
    ?.trim();

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey)
    return json({ error: "Missing required environment variables" }, 500);

  let payload: RequestPayload;
  try {
    payload = await parseJsonBody<RequestPayload>(req);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid JSON body")
      return json({ error: error.message }, 400);

    throw error;
  }

  const firstName = sanitizeSingleLineText(payload.first_name, 80);
  const lastName = sanitizeSingleLineText(payload.last_name, 120);
  const email = sanitizeSingleLineText(payload.email, 180).toLowerCase();
  const password =
    typeof payload.password === "string" ? payload.password.trim() : "";
  const dateOfBirth = sanitizeSingleLineText(payload.date_of_birth, 20);
  const preferredOppositionId = sanitizeCode(
    payload.preferred_opposition_id,
    120
  );
  const locale = sanitizeCode(payload.locale, 12) || "es";
  const userMetadata: UserMetadataPayload = {
    first_name: firstName,
    last_name: lastName,
    full_name: `${firstName} ${lastName}`.trim(),
    date_of_birth: dateOfBirth || null,
    preferred_opposition_id: preferredOppositionId || null,
    preferred_opposition: preferredOppositionId || null,
    locale
  };

  if (!firstName || !lastName) return json({ error: "name_required" }, 400);
  if (!/\S+@\S+\.\S+/.test(email))
    return json({ error: "valid_email_required" }, 400);
  if (password.length < 8) return json({ error: "password_too_short" }, 400);

  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false }
  });
  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false }
  });

  try {
    let userId = "";
    let accessToken = "";
    let refreshToken = "";
    let autoLogin = false;
    let sendEmail = true;

    const { data: signUpData, error: signUpError } =
      await anonClient.auth.signUp({
        email,
        password,
        options: {
          data: userMetadata
        }
      });

    if (signUpError) {
      if (!isEmailRateLimitError(signUpError.message))
        return json({ error: signUpError.message }, 400);

      sendEmail = false;

      const { data: existingSignInData, error: existingSignInError } =
        await anonClient.auth.signInWithPassword({
          email,
          password
        });

      if (
        !existingSignInError &&
        existingSignInData.user &&
        existingSignInData.session
      ) {
        userId = sanitizeCode(existingSignInData.user.id, 80);
        accessToken = sanitizeSingleLineText(
          existingSignInData.session.access_token,
          4096
        );
        refreshToken = sanitizeSingleLineText(
          existingSignInData.session.refresh_token,
          4096
        );
        autoLogin = Boolean(userId && accessToken && refreshToken);
      } else {
        const { data: createdUserData, error: createdUserError } =
          await serviceClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: userMetadata
          });

        if (createdUserError)
          return json({ error: createdUserError.message }, 400);

        userId = sanitizeCode(createdUserData.user?.id, 80);

        const { data: signInData, error: signInError } =
          await anonClient.auth.signInWithPassword({
            email,
            password
          });

        if (signInError || !signInData.user || !signInData.session)
          return json(
            {
              error: signInError?.message || "auto_login_after_signup_failed"
            },
            400
          );

        userId = sanitizeCode(signInData.user.id, 80);
        accessToken = sanitizeSingleLineText(
          signInData.session.access_token,
          4096
        );
        refreshToken = sanitizeSingleLineText(
          signInData.session.refresh_token,
          4096
        );
        autoLogin = Boolean(userId && accessToken && refreshToken);
      }
    } else {
      userId = sanitizeCode(signUpData.user?.id, 80);
      accessToken = sanitizeSingleLineText(
        signUpData.session?.access_token,
        4096
      );
      refreshToken = sanitizeSingleLineText(
        signUpData.session?.refresh_token,
        4096
      );
      autoLogin = Boolean(userId && accessToken && refreshToken);
      sendEmail = !autoLogin;
    }

    if (!userId) return json({ error: "signup_user_id_missing" }, 500);

    return json({
      ok: true,
      send_email: sendEmail,
      auto_login: autoLogin,
      access_token: autoLogin ? accessToken : "",
      refresh_token: autoLogin ? refreshToken : ""
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 500);
  }
});
