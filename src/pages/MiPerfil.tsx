import { useAuth } from "@/auth/AuthProvider";
import ConfirmActionDialog from "@/components/ConfirmActionDialog";
import CustomButton from "@/components/ui/custom-button";
import CustomInput from "@/components/ui/custom-input";
import CustomSelect from "@/components/ui/custom-select";
import CustomTextarea from "@/components/ui/custom-textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { resolveOppositionNameById } from "@/data/oposicionesDb";
import { useToast } from "@/hooks/use-toast";
import type { AppLocale } from "@/i18n/locales";
import { normalizeLocale } from "@/i18n/locales";
import { supabase } from "@/integrations/supabase/client";
import {
  useOppositionOptionsQuery,
  useProfileDetailsQuery,
  useResolvedOppositionQuery
} from "@/queries/profileQueries";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Pencil, Save, Trash2, User } from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type ProfileForm = {
  firstName: string;
  lastName: string;
  email: string;
  age: string;
  preferredOppositionId: string;
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
  preferredOppositionId: "",
  yearsPreparing: "",
  weeklyTargetHours: "16",
  testsPerWeek: "",
  mainChallenge: "",
  avatarUrl: ""
};

const AVATAR_BUCKET = "profile-avatars";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
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
  const { t } = useTranslation(["profile", "common"]);
  const { toast } = useToast();
  const { user, isAuthReady, locale, setLocale, refreshProfile } = useAuth();
  const shouldLoadProfile = isAuthReady && Boolean(user?.id);
  const queryClient = useQueryClient();
  const userMetadata = useMemo(
    () => (user?.user_metadata ?? {}) as Record<string, unknown>,
    [user?.user_metadata]
  );
  const { data: profileDetails, isFetching: isFetchingProfileDetails } =
    useProfileDetailsQuery(shouldLoadProfile ? user?.id : null);
  const preferredOppositionId = String(
    profileDetails?.preferred_opposition_id ??
      userMetadata.preferred_opposition_id ??
      ""
  );
  const preferredOppositionName = String(
    profileDetails?.preferred_opposition ??
      userMetadata.preferred_opposition ??
      ""
  );
  const { data: resolvedOpposition, isFetching: isFetchingResolvedOpposition } =
    useResolvedOppositionQuery({
      preferredOppositionId,
      preferredOppositionName,
      locale,
      enabled: shouldLoadProfile
    });
  const { data: oppositionOptions = [] } = useOppositionOptionsQuery(locale);
  const [profile, setProfile] = useState<ProfileForm>(initialProfile);
  const [persistedAvatarUrl, setPersistedAvatarUrl] = useState("");
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingOpposition, setIsChangingOpposition] = useState(false);
  const [isChangingLocale, setIsChangingLocale] = useState(false);
  const [isAvatarUpdating, setIsAvatarUpdating] = useState(false);
  const [activeOppositionId, setActiveOppositionId] = useState("");
  const [isOppositionDialogOpen, setIsOppositionDialogOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const hasAvatar = Boolean(sanitizeAvatarForMetadata(profile.avatarUrl));

  const getOppositionName = (oppositionId: string | null | undefined) =>
    resolveOppositionNameById(oppositionId, oppositionOptions);

  useEffect(() => {
    if (!isAuthReady) return;
    const userId = user?.id;
    const userEmail = user?.email ?? "";

    if (!userId) {
      setProfile(initialProfile);
      setPersistedAvatarUrl("");
      setActiveOppositionId("");
      setIsLoadingProfile(false);
      return;
    }

    if (
      (isFetchingProfileDetails && !profileDetails) ||
      (isFetchingResolvedOpposition && !resolvedOpposition)
    ) {
      setIsLoadingProfile(true);
      return;
    }

    const resolvedAvatar = sanitizeAvatarForMetadata(
      String(profileDetails?.avatar_url ?? userMetadata.avatar_url ?? "")
    );
    const resolvedOppositionId =
      resolvedOpposition?.id ||
      String(userMetadata.preferred_opposition_id ?? "");

    setProfile({
      firstName: String(
        profileDetails?.first_name ?? userMetadata.first_name ?? ""
      ),
      lastName: String(
        profileDetails?.last_name ?? userMetadata.last_name ?? ""
      ),
      email: String(profileDetails?.email ?? userEmail),
      age:
        profileDetails?.age != null
          ? String(profileDetails.age)
          : String(userMetadata.age ?? ""),
      preferredOppositionId: resolvedOppositionId,
      yearsPreparing:
        profileDetails?.years_preparing != null
          ? String(profileDetails.years_preparing)
          : String(userMetadata.years_preparing ?? ""),
      weeklyTargetHours:
        profileDetails?.weekly_target_hours != null
          ? String(profileDetails.weekly_target_hours)
          : String(userMetadata.weekly_target_hours ?? "16"),
      testsPerWeek:
        profileDetails?.tests_per_week != null
          ? String(profileDetails.tests_per_week)
          : String(userMetadata.tests_per_week ?? ""),
      mainChallenge: String(
        profileDetails?.main_challenge ?? userMetadata.main_challenge ?? ""
      ),
      avatarUrl: resolvedAvatar
    });
    setPersistedAvatarUrl(resolvedAvatar);
    setActiveOppositionId(resolvedOppositionId);
    setIsLoadingProfile(false);
  }, [
    isAuthReady,
    isFetchingProfileDetails,
    isFetchingResolvedOpposition,
    profileDetails,
    resolvedOpposition,
    user?.id,
    user?.email,
    userMetadata
  ]);

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isAvatarUpdating) return;

    if (file.size > MAX_AVATAR_BYTES) {
      e.target.value = "";
      toast({
        variant: "destructive",
        title: t("profile:myProfile.toasts.imageTooLargeTitle"),
        description: t("profile:myProfile.toasts.imageTooLargeDescription")
      });
      return;
    }

    if (file.type && !ALLOWED_AVATAR_TYPES.has(file.type.toLowerCase())) {
      e.target.value = "";
      toast({
        variant: "destructive",
        title: t("profile:myProfile.toasts.invalidFormatTitle"),
        description: t("profile:myProfile.toasts.invalidFormatDescription")
      });
      return;
    }

    if (!user) {
      e.target.value = "";
      toast({
        variant: "destructive",
        title: t("profile:myProfile.toasts.invalidSessionTitle"),
        description: t("profile:myProfile.toasts.invalidSessionDescription")
      });
      return;
    }

    setIsAvatarUpdating(true);
    try {
      const currentAvatarInProfile = persistedAvatarUrl;
      const previousAvatarPath = extractAvatarStoragePath(
        currentAvatarInProfile
      );
      const uploadedAvatarPath = buildAvatarStoragePath(user.id, file);

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(uploadedAvatarPath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined
        });

      if (uploadError) {
        toast({
          variant: "destructive",
          title: t("profile:myProfile.toasts.uploadFailedTitle"),
          description: uploadError.message
        });
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from(AVATAR_BUCKET)
        .getPublicUrl(uploadedAvatarPath);
      const nextAvatarUrl = sanitizeAvatarForMetadata(publicUrlData.publicUrl);

      const { error: saveError } = await supabase.from("profiles").upsert(
        {
          user_id: user.id,
          avatar_url: nextAvatarUrl,
          locale
        },
        { onConflict: "user_id" }
      );

      if (saveError) {
        await supabase.storage.from(AVATAR_BUCKET).remove([uploadedAvatarPath]);
        toast({
          variant: "destructive",
          title: t("profile:myProfile.toasts.saveFailedTitle"),
          description: saveError.message
        });
        return;
      }

      if (previousAvatarPath && previousAvatarPath !== uploadedAvatarPath)
        await supabase.storage.from(AVATAR_BUCKET).remove([previousAvatarPath]);

      setPersistedAvatarUrl(nextAvatarUrl);
      setProfile((prev) => ({ ...prev, avatarUrl: nextAvatarUrl }));
      await refreshProfile();
    } catch {
      toast({
        variant: "destructive",
        title: t("profile:myProfile.toasts.saveFailedTitle"),
        description: t("profile:myProfile.toasts.unexpectedErrorDescription")
      });
    } finally {
      setIsAvatarUpdating(false);
      e.target.value = "";
    }
  };

  const handleOpenAvatarFilePicker = () => {
    if (!avatarInputRef.current || isAvatarUpdating) return;
    avatarInputRef.current.value = "";
    avatarInputRef.current.click();
  };

  const handleRemoveAvatar = async () => {
    if (!user || isAvatarUpdating || !hasAvatar) return;

    setIsAvatarUpdating(true);
    try {
      const currentAvatarInProfile = persistedAvatarUrl;
      const previousAvatarPath = extractAvatarStoragePath(
        currentAvatarInProfile
      );
      const { error: saveError } = await supabase.from("profiles").upsert(
        {
          user_id: user.id,
          avatar_url: null,
          locale
        },
        { onConflict: "user_id" }
      );

      if (saveError) {
        toast({
          variant: "destructive",
          title: t("profile:myProfile.toasts.saveFailedTitle"),
          description: saveError.message
        });
        return;
      }

      if (previousAvatarPath)
        await supabase.storage.from(AVATAR_BUCKET).remove([previousAvatarPath]);

      setPersistedAvatarUrl("");
      setProfile((prev) => ({ ...prev, avatarUrl: "" }));
      await refreshProfile();
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    } catch {
      toast({
        variant: "destructive",
        title: t("profile:myProfile.toasts.saveFailedTitle"),
        description: t("profile:myProfile.toasts.unexpectedErrorDescription")
      });
    } finally {
      setIsAvatarUpdating(false);
    }
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
    const avatarUrlForProfile = sanitizeAvatarForMetadata(profile.avatarUrl);

    const nextWeeklyTargetHours = parseOptionalInteger(
      profile.weeklyTargetHours
    );
    const selectedOppositionCode = profile.preferredOppositionId || null;
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
      preferred_opposition_id: profile.preferredOppositionId || null,
      preferred_opposition: selectedOppositionCode,
      avatar_url: avatarUrlForProfile || null,
      locale
    };

    const { error } = await supabase
      .from("profiles")
      .upsert(profilePayload, { onConflict: "user_id" });

    if (error) {
      toast({
        variant: "destructive",
        title: t("profile:myProfile.toasts.saveFailedTitle"),
        description: error.message
      });
      setIsSavingProfile(false);
      return;
    }

    const previousAvatarPath = extractAvatarStoragePath(currentAvatarInProfile);
    if (!avatarUrlForProfile && previousAvatarPath)
      await supabase.storage.from(AVATAR_BUCKET).remove([previousAvatarPath]);

    setPersistedAvatarUrl(avatarUrlForProfile);
    setProfile((prev) => ({ ...prev, avatarUrl: avatarUrlForProfile }));

    toast({
      title: t("profile:myProfile.toasts.updatedTitle"),
      description: t("profile:myProfile.toasts.updatedDescription")
    });
    await queryClient.invalidateQueries({ queryKey: ["profiles"] });
    await refreshProfile();
    setIsSavingProfile(false);
  };

  const handleOpenOppositionDialog = () => {
    const nextOppositionId = profile.preferredOppositionId.trim();

    if (!nextOppositionId) {
      toast({
        variant: "destructive",
        title: t("profile:myProfile.toasts.selectOppositionTitle"),
        description: t("profile:myProfile.toasts.selectOppositionDescription")
      });
      return;
    }

    if (nextOppositionId === activeOppositionId) {
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

    const nextOppositionId = profile.preferredOppositionId.trim();
    if (!nextOppositionId) return;
    const nextOppositionCode = nextOppositionId || null;
    setIsChangingOpposition(true);

    const { error } = await supabase.from("profiles").upsert(
      {
        user_id: user.id,
        preferred_opposition_id: nextOppositionId,
        preferred_opposition: nextOppositionCode,
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

    setActiveOppositionId(nextOppositionId);
    setProfile((prev) => ({
      ...prev,
      preferredOppositionId: nextOppositionId
    }));
    setIsOppositionDialogOpen(false);
    toast({
      title: t("profile:myProfile.toasts.oppositionUpdatedTitle"),
      description: t("profile:myProfile.toasts.oppositionUpdatedDescription")
    });
    await queryClient.invalidateQueries({ queryKey: ["profiles"] });
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
            <div className="shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <CustomButton
                    type="button"
                    aria-label={t("profile:myProfile.avatarMenuLabel")}
                    disabled={isAvatarUpdating}
                    styleType="unstyled"
                    size="none"
                    radius="none"
                    className="group relative h-20 w-20 overflow-hidden rounded-full border border-border bg-secondary ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-80"
                  >
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
                    <span className="pointer-events-none absolute inset-0 bg-background/55 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100" />
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-all duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                      <span className="inline-flex h-12 w-12 items-center justify-center bg-black/40 rounded-full shadow-sm">
                        <Pencil className="h-6 w-6 text-foreground" />
                      </span>
                    </span>
                    {isAvatarUpdating ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                        <Loader2 className="h-5 w-5 animate-spin text-foreground" />
                      </span>
                    ) : null}
                  </CustomButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  sideOffset={10}
                  className="w-56"
                >
                  <DropdownMenuItem
                    onSelect={handleOpenAvatarFilePicker}
                    disabled={isAvatarUpdating}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Camera className="h-4 w-4" />
                    {t("profile:myProfile.changeImage")}
                  </DropdownMenuItem>
                  {hasAvatar ? (
                    <DropdownMenuItem
                      onSelect={handleRemoveAvatar}
                      disabled={isAvatarUpdating}
                      className="flex items-center gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t("profile:myProfile.removeImage")}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
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
            </div>
          </div>

          <CustomButton
            type="button"
            onClick={handleSaveProfile}
            disabled={isSavingProfile || isAvatarUpdating}
            styleType="primary"
          >
            <Save className="h-4 w-4" />
            {isSavingProfile
              ? t("profile:myProfile.saving")
              : t("profile:myProfile.save")}
          </CustomButton>
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
          <CustomTextarea
            rows={4}
            value={profile.mainChallenge}
            onChange={(e) =>
              setProfile((prev) => ({ ...prev, mainChallenge: e.target.value }))
            }
            resize="none"
            className="min-h-min"
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
            {getOppositionName(activeOppositionId) ||
              t("profile:myProfile.oppositionSection.undefined")}
          </p>

          <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
            {t("profile:myProfile.oppositionSection.newOpposition")}
          </label>
          <CustomSelect
            value={profile.preferredOppositionId}
            onChange={(e) =>
              setProfile((prev) => ({
                ...prev,
                preferredOppositionId: e.target.value
              }))
            }
            className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
          >
            <option value="">
              {t("profile:myProfile.oppositionSection.selectOption")}
            </option>
            {oppositionOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </CustomSelect>

          <p className="mt-3 text-xs text-muted-foreground">
            {t("profile:myProfile.oppositionSection.description")}
          </p>

          <CustomButton
            type="button"
            onClick={handleOpenOppositionDialog}
            disabled={isChangingOpposition}
            styleType="destructive"
            className="mt-4"
          >
            {isChangingOpposition
              ? t("profile:myProfile.oppositionSection.changing")
              : t("profile:myProfile.oppositionSection.change")}
          </CustomButton>
        </div>
      </section>

      <ConfirmActionDialog
        open={isOppositionDialogOpen}
        onOpenChange={setIsOppositionDialogOpen}
        title={t("profile:myProfile.dialog.title")}
        description={t("profile:myProfile.dialog.description", {
          opposition: getOppositionName(profile.preferredOppositionId)
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
