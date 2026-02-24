import type { Session } from "@supabase/supabase-js";

export const isSessionExpired = (session: Session | null | undefined) => {
  if (!session) return true;
  if (!session.expires_at) return false;

  const nowInSeconds = Math.floor(Date.now() / 1000);
  return session.expires_at <= nowInSeconds;
};
