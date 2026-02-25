import { useAuth } from "@/auth/AuthProvider";
import ConfirmActionDialog from "@/components/ConfirmActionDialog";
import CustomInput from "@/components/ui/custom-input";
import CustomSelect from "@/components/ui/custom-select";
import {
  obtenerNombresOposiciones,
  resolverNombreOposicion
} from "@/data/oposiciones";
import { useToast } from "@/hooks/use-toast";
import type { AppLocale } from "@/i18n/locales";
import { normalizeLocale } from "@/i18n/locales";
import { supabase } from "@/integrations/supabase/client";
import { Camera, Save, User } from "lucide-react";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type ProfileForm = {
  firstName: string;
  lastName: string;
  email: string;
  age: string;
  preferredOpposition: string;
  yearsPreparing: string;
  weeklyTargetHours: string;
  testsPerWeek: string;
  mainChallenge: string;
  avatarUrl: string;
};

const initialProfile: ProfileForm = {
  firstName: "",
  lastName: "",
  email: "",
  age: "",
  preferredOpposition: "",
  yearsPreparing: "",
  weeklyTargetHours: "16",
  testsPerWeek: "",
  mainChallenge: "",
  avatarUrl: ""
};

const AVATAR_BUCKET = "profile-avatars";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const PROFILE_LOAD_TIMEOUT_MS = 12000;
const ALLOWED_AVATAR_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif"
]);

const sanitizeAvatarForMetadata = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("data:") || lower.startsWith("blob:")) return "";
  return trimmed;
};

const extractAvatarStoragePath = (value: string) => {
  const sanitized = sanitizeAvatarForMetadata(value);
  if (!sanitized) return null;

  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
  const markerIndex = sanitized.indexOf(marker);
  if (markerIndex === -1) return null;

  return decodeURIComponent(sanitized.slice(markerIndex + marker.length));
};

const buildAvatarStoragePath = (userId: string, file: File) => {
  const cleanName = file.name.trim().toLowerCase();
  const extensionFromName = cleanName.includes(".")
    ? cleanName.split(".").pop()
    : "";
  const extensionFromType = file.type.startsWith("image/")
    ? file.type.replace("image/", "")
    : "";
  const extension = extensionFromName || extensionFromType || "jpg";
  const uniqueId = Math.random().toString(36).slice(2, 10);
  return `${userId}/${Date.now()}-${uniqueId}.${extension}`;
};

const parseOptionalInteger = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const MiPerfil = () => {
  const { t } = useTranslation(["profile", "common", "oppositions"]);
  const { toast } = useToast();
  const { user, isAuthReady, locale, setLocale, refreshProfile } = useAuth();
  const [profile, setProfile] = useState<ProfileForm>(initialProfile);
  const [persistedAvatarUrl, setPersistedAvatarUrl] = useState("");
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingOpposition, setIsChangingOpposition] = useState(false);
  const [isChangingLocale, setIsChangingLocale] = useState(false);
  const [activeOpposition, setActiveOpposition] = useState("");
  const [isOppositionDialogOpen, setIsOppositionDialogOpen] = useState(false);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const avatarBlobPreviewRef = useRef<string | null>(null);

  const oppositionOptions = obtenerNombresOposiciones();

  const clearAvatarBlobPreview = () => {
    if (!avatarBlobPreviewRef.current) return;
    URL.revokeObjectURL(avatarBlobPreviewRef.current);
    avatarBlobPreviewRef.current = null;
  };

  useEffect(() => {
    return () => {
      clearAvatarBlobPreview();
    };
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;
    const userId = user?.id;
    const userEmail = user?.email ?? "";
    const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;

    if (!userId) {
      setProfile(initialProfile);
      setPendingAvatarFile(null);
      clearAvatarBlobPreview();
      setPersistedAvatarUrl("");
      setActiveOpposition("");
      setIsLoadingProfile(false);
      return;
    }

    let isMounted = true;

    const loadProfile = async () => {
      setIsLoadingProfile(true);
      const abortController = new AbortController();
      const timeoutId = window.setTimeout(
        () => abortController.abort("profile_load_timeout"),
        PROFILE_LOAD_TIMEOUT_MS
      );

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select(
            "email, first_name, last_name, age, preferred_opposition, years_preparing, weekly_target_hours, tests_per_week, main_challenge, avatar_url"
          )
          .eq("user_id", userId)
          .abortSignal(abortController.signal)
          .maybeSingle();

        if (error) throw error;
        if (!isMounted) return;

        const resolvedOpposition = resolverNombreOposicion(
          String(
            data?.preferred_opposition ?? metadata.preferred_opposition ?? ""
          )
        );

        const resolvedAvatar = sanitizeAvatarForMetadata(
          String(data?.avatar_url ?? metadata.avatar_url ?? "")
        );

        setProfile({
          firstName: String(data?.first_name ?? metadata.first_name ?? ""),
          lastName: String(data?.last_name ?? metadata.last_name ?? ""),
          email: String(data?.email ?? userEmail),
          age:
            data?.age != null ? String(data.age) : String(metadata.age ?? ""),
          preferredOpposition: resolvedOpposition,
          yearsPreparing:
            data?.years_preparing != null
              ? String(data.years_preparing)
              : String(metadata.years_preparing ?? ""),
          weeklyTargetHours:
            data?.weekly_target_hours != null
              ? String(data.weekly_target_hours)
              : String(metadata.weekly_target_hours ?? "16"),
          testsPerWeek:
            data?.tests_per_week != null
              ? String(data.tests_per_week)
              : String(metadata.tests_per_week ?? ""),
          mainChallenge: String(
            data?.main_challenge ?? metadata.main_challenge ?? ""
          ),
          avatarUrl: resolvedAvatar
        });

        setPersistedAvatarUrl(resolvedAvatar);
        setPendingAvatarFile(null);
        clearAvatarBlobPreview();
        setActiveOpposition(resolvedOpposition);
      } catch {
        if (!isMounted) return;

        const fallbackOpposition = resolverNombreOposicion(
          String(metadata.preferred_opposition ?? "")
        );
        const fallbackAvatar = sanitizeAvatarForMetadata(
          String(metadata.avatar_url ?? "")
        );

        setProfile({
          firstName: String(metadata.first_name ?? ""),
          lastName: String(metadata.last_name ?? ""),
          email: String(userEmail),
          age: String(metadata.age ?? ""),
          preferredOpposition: fallbackOpposition,
          yearsPreparing: String(metadata.years_preparing ?? ""),
          weeklyTargetHours: String(metadata.weekly_target_hours ?? "16"),
          testsPerWeek: String(metadata.tests_per_week ?? ""),
          mainChallenge: String(metadata.main_challenge ?? ""),
          avatarUrl: fallbackAvatar
        });
        setPersistedAvatarUrl(fallbackAvatar);
        setPendingAvatarFile(null);
        clearAvatarBlobPreview();
        setActiveOpposition(fallbackOpposition);
      } finally {
        window.clearTimeout(timeoutId);
        if (isMounted) setIsLoadingProfile(false);
      }
    };

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, [isAuthReady, user?.id, user?.email, user?.user_metadata]);

  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_AVATAR_BYTES) {
      toast({
        variant: "destructive",
        title: t("profile:myProfile.toasts.imageTooLargeTitle"),
        description: t("profile:myProfile.toasts.imageTooLargeDescription")
      });
      return;
    }

    if (file.type && !ALLOWED_AVATAR_TYPES.has(file.type.toLowerCase())) {
      toast({
        variant: "destructive",
        title: t("profile:myProfile.toasts.invalidFormatTitle"),
        description: t("profile:myProfile.toasts.invalidFormatDescription")
      });
      return;
    }

    clearAvatarBlobPreview();
    const previewUrl = URL.createObjectURL(file);
    avatarBlobPreviewRef.current = previewUrl;
    setPendingAvatarFile(file);
    setProfile((prev) => ({ ...prev, avatarUrl: previewUrl }));
  };

  const handleSaveProfile = async () => {
    if (!user) {
      toast({
        variant: "destructive",
        title: t("profile:myProfile.toasts.invalidSessionTitle"),
        description: t("profile:myProfile.toasts.invalidSessionDescription")
      });
      return;
    }

    if (!profile.firstName.trim() || !profile.lastName.trim()) {
      toast({
        variant: "destructive",
        title: t("profile:myProfile.toasts.missingDataTitle"),
        description: t("profile:myProfile.toasts.missingDataDescription")
      });
      return;
    }

    setIsSavingProfile(true);

    const currentAvatarInProfile = persistedAvatarUrl;
    let avatarUrlForProfile =
      sanitizeAvatarForMetadata(profile.avatarUrl) || currentAvatarInProfile;
    let uploadedAvatarPath: string | null = null;

    if (pendingAvatarFile) {
      uploadedAvatarPath = buildAvatarStoragePath(user.id, pendingAvatarFile);
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(uploadedAvatarPath, pendingAvatarFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: pendingAvatarFile.type || undefined
        });

      if (uploadError) {
        toast({
          variant: "destructive",
          title: t("profile:myProfile.toasts.uploadFailedTitle"),
          description: uploadError.message
        });
        setIsSavingProfile(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from(AVATAR_BUCKET)
        .getPublicUrl(uploadedAvatarPath);
      avatarUrlForProfile = sanitizeAvatarForMetadata(publicUrlData.publicUrl);
    }

    const nextWeeklyTargetHours = parseOptionalInteger(
      profile.weeklyTargetHours
    );
    const profilePayload = {
      user_id: user.id,
      email: profile.email.trim() || user.email || null,
      first_name: profile.firstName.trim(),
      last_name: profile.lastName.trim(),
      full_name:
        `${profile.firstName.trim()} ${profile.lastName.trim()}`.trim(),
      age: parseOptionalInteger(profile.age),
      years_preparing: parseOptionalInteger(profile.yearsPreparing),
      weekly_target_hours:
        nextWeeklyTargetHours && nextWeeklyTargetHours > 0
          ? nextWeeklyTargetHours
          : 16,
      tests_per_week: parseOptionalInteger(profile.testsPerWeek),
      main_challenge: profile.mainChallenge.trim() || null,
      avatar_url: avatarUrlForProfile || null,
      locale
    };

    const { error } = await supabase
      .from("profiles")
      .upsert(profilePayload, { onConflict: "user_id" });

    if (error) {
      if (uploadedAvatarPath)
        await supabase.storage.from(AVATAR_BUCKET).remove([uploadedAvatarPath]);

      toast({
        variant: "destructive",
        title: t("profile:myProfile.toasts.saveFailedTitle"),
        description: error.message
      });
      setIsSavingProfile(false);
      return;
    }

    if (pendingAvatarFile) {
      const previousAvatarPath = extractAvatarStoragePath(
        currentAvatarInProfile
      );
      if (previousAvatarPath && previousAvatarPath !== uploadedAvatarPath)
        await supabase.storage.from(AVATAR_BUCKET).remove([previousAvatarPath]);

      clearAvatarBlobPreview();
      setPendingAvatarFile(null);
      setPersistedAvatarUrl(avatarUrlForProfile);
      setProfile((prev) => ({ ...prev, avatarUrl: avatarUrlForProfile }));
    }

    toast({
      title: t("profile:myProfile.toasts.updatedTitle"),
      description: t("profile:myProfile.toasts.updatedDescription")
    });
    await refreshProfile();
    setIsSavingProfile(false);
  };

  const handleOpenOppositionDialog = () => {
    const nextOpposition = resolverNombreOposicion(profile.preferredOpposition);

    if (!nextOpposition) {
      toast({
        variant: "destructive",
        title: t("profile:myProfile.toasts.selectOppositionTitle"),
        description: t("profile:myProfile.toasts.selectOppositionDescription")
      });
      return;
    }

    if (nextOpposition === activeOpposition) {
      toast({
        title: t("profile:myProfile.toasts.noChangesTitle"),
        description: t("profile:myProfile.toasts.noChangesDescription")
      });
      return;
    }

    setIsOppositionDialogOpen(true);
  };

  const handleChangeOpposition = async () => {
    if (!user) return;

    const nextOpposition = resolverNombreOposicion(profile.preferredOpposition);
    setIsChangingOpposition(true);

    const { error } = await supabase.from("profiles").upsert(
      {
        user_id: user.id,
        preferred_opposition: nextOpposition,
        locale
      },
      { onConflict: "user_id" }
    );

    if (error) {
      toast({
        variant: "destructive",
        title: t("profile:myProfile.toasts.changeOppositionFailedTitle"),
        description: error.message
      });
      setIsChangingOpposition(false);
      return;
    }

    setActiveOpposition(nextOpposition);
    setProfile((prev) => ({ ...prev, preferredOpposition: nextOpposition }));
    setIsOppositionDialogOpen(false);
    toast({
      title: t("profile:myProfile.toasts.oppositionUpdatedTitle"),
      description: t("profile:myProfile.toasts.oppositionUpdatedDescription")
    });
    setIsChangingOpposition(false);
  };

  const handleLocaleChange = async (event: ChangeEvent<HTMLSelectElement>) => {
    const nextLocale = normalizeLocale(event.target.value) as AppLocale;
    if (nextLocale === locale) return;

    setIsChangingLocale(true);
    const success = await setLocale(nextLocale);
    setIsChangingLocale(false);

    if (!success) {
      toast({
        variant: "destructive",
        title: t("profile:myProfile.toasts.localeUpdateFailedTitle"),
        description: t("profile:myProfile.toasts.localeUpdateFailedDescription")
      });
      return;
    }

    toast({
      title: t("profile:myProfile.toasts.localeUpdatedTitle"),
      description: t("profile:myProfile.toasts.localeUpdatedDescription")
    });
  };

  if (isLoadingProfile) {
    return (
      <div className="border border-border bg-background p-6">
        <p className="text-sm text-muted-foreground">
          {t("profile:myProfile.loading")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="border border-border bg-background/95 p-6 md:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="relative h-20 w-20 shrink-0 rounded-full border border-border bg-secondary overflow-hidden">
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={t("profile:myProfile.avatarAlt")}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full inline-flex items-center justify-center">
                  <User className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
                {t("profile:myProfile.sectionBadge")}
              </p>
              <h1 className="text-2xl md:text-3xl font-serif text-foreground">
                {profile.firstName || t("profile:myProfile.defaultUser")}{" "}
                {profile.lastName}
              </h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                {t("profile:myProfile.description")}
              </p>
              <label className="mt-3 inline-flex items-center gap-2 border border-border px-3 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-secondary transition-colors cursor-pointer">
                <Camera className="h-3.5 w-3.5" />
                {t("profile:myProfile.changeImage")}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </label>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={isSavingProfile}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4" />
            {isSavingProfile
              ? t("profile:myProfile.saving")
              : t("profile:myProfile.save")}
          </button>
        </div>
      </section>

      <section className="border border-border bg-background p-6 md:p-8">
        <div className="mb-5">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
            {t("profile:myProfile.dataSection.badge")}
          </p>
          <h2 className="text-xl font-serif text-foreground">
            {t("profile:myProfile.dataSection.title")}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
              {t("profile:myProfile.fields.name")}
            </label>
            <CustomInput
              type="text"
              value={profile.firstName}
              onChange={(e) =>
                setProfile((prev) => ({ ...prev, firstName: e.target.value }))
              }
              className="w-full"
            />
          </div>
          <div>
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
              {t("profile:myProfile.fields.lastName")}
            </label>
            <CustomInput
              type="text"
              value={profile.lastName}
              onChange={(e) =>
                setProfile((prev) => ({ ...prev, lastName: e.target.value }))
              }
              className="w-full"
            />
          </div>
          <div>
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
              {t("profile:myProfile.fields.email")}
            </label>
            <CustomInput
              type="email"
              value={profile.email}
              disabled
              className="w-full bg-secondary/40 text-muted-foreground"
            />
          </div>
          <div>
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
              {t("profile:myProfile.fields.locale")}
            </label>
            <CustomSelect
              value={locale}
              onChange={handleLocaleChange}
              disabled={isChangingLocale}
              className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground disabled:opacity-70"
            >
              <option value="es">{t("common:locale.es")}</option>
              <option value="en">{t("common:locale.en")}</option>
            </CustomSelect>
          </div>
          <div>
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
              {t("profile:myProfile.fields.age")}
            </label>
            <CustomInput
              type="number"
              min={16}
              max={75}
              value={profile.age}
              onChange={(e) =>
                setProfile((prev) => ({ ...prev, age: e.target.value }))
              }
              className="w-full"
            />
          </div>
          <div>
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
              {t("profile:myProfile.fields.yearsPreparing")}
            </label>
            <CustomInput
              type="number"
              min={0}
              max={40}
              value={profile.yearsPreparing}
              onChange={(e) =>
                setProfile((prev) => ({
                  ...prev,
                  yearsPreparing: e.target.value
                }))
              }
              className="w-full"
            />
          </div>
          <div>
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
              {t("profile:myProfile.fields.weeklyTargetHours")}
            </label>
            <CustomInput
              type="number"
              min={1}
              max={80}
              value={profile.weeklyTargetHours}
              onChange={(e) =>
                setProfile((prev) => ({
                  ...prev,
                  weeklyTargetHours: e.target.value
                }))
              }
              className="w-full"
            />
          </div>
          <div>
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
              {t("profile:myProfile.fields.testsPerWeek")}
            </label>
            <CustomInput
              type="number"
              min={1}
              max={14}
              value={profile.testsPerWeek}
              onChange={(e) =>
                setProfile((prev) => ({
                  ...prev,
                  testsPerWeek: e.target.value
                }))
              }
              className="w-full"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
            {t("profile:myProfile.fields.mainChallenge")}
          </label>
          <textarea
            rows={4}
            value={profile.mainChallenge}
            onChange={(e) =>
              setProfile((prev) => ({ ...prev, mainChallenge: e.target.value }))
            }
            className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground min-h-min"
            placeholder={t("profile:myProfile.fields.mainChallengePlaceholder")}
          />
        </div>
      </section>

      <section className="border border-border bg-background p-6 md:p-8">
        <div className="mb-5">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
            {t("profile:myProfile.oppositionSection.badge")}
          </p>
          <h2 className="text-xl font-serif text-foreground">
            {t("profile:myProfile.oppositionSection.title")}
          </h2>
        </div>

        <div className="rounded-xl border border-border bg-secondary/30 p-4">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
            {t("profile:myProfile.oppositionSection.studyingNow")}
          </p>
          <p className="text-sm font-medium text-foreground mb-3">
            {activeOpposition ||
              t("profile:myProfile.oppositionSection.undefined")}
          </p>

          <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
            {t("profile:myProfile.oppositionSection.newOpposition")}
          </label>
          <CustomSelect
            value={profile.preferredOpposition}
            onChange={(e) =>
              setProfile((prev) => ({
                ...prev,
                preferredOpposition: e.target.value
              }))
            }
            className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
          >
            <option value="">
              {t("profile:myProfile.oppositionSection.selectOption")}
            </option>
            {oppositionOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </CustomSelect>

          <p className="mt-3 text-xs text-muted-foreground">
            {t("profile:myProfile.oppositionSection.description")}
          </p>

          <button
            type="button"
            onClick={handleOpenOppositionDialog}
            disabled={isChangingOpposition}
            className="mt-4 inline-flex items-center gap-2 bg-destructive text-destructive-foreground px-4 py-2.5 text-xs font-semibold tracking-widest uppercase hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {isChangingOpposition
              ? t("profile:myProfile.oppositionSection.changing")
              : t("profile:myProfile.oppositionSection.change")}
          </button>
        </div>
      </section>

      <ConfirmActionDialog
        open={isOppositionDialogOpen}
        onOpenChange={setIsOppositionDialogOpen}
        title={t("profile:myProfile.dialog.title")}
        description={t("profile:myProfile.dialog.description", {
          opposition: resolverNombreOposicion(profile.preferredOpposition)
        })}
        confirmLabel={
          isChangingOpposition
            ? t("profile:myProfile.dialog.changing")
            : t("profile:myProfile.dialog.confirm")
        }
        cancelLabel={t("profile:myProfile.dialog.cancel")}
        confirmStyle="destructive"
        isLoading={isChangingOpposition}
        onConfirm={handleChangeOpposition}
      />
    </div>
  );
};

export default MiPerfil;
