import { ChangeEvent, useEffect, useState } from "react";
import { Camera, Save, User } from "lucide-react";
import { useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import ConfirmActionDialog from "@/components/ConfirmActionDialog";
import { obtenerNombresOposiciones, resolverNombreOposicion } from "@/data/oposiciones";
import { useAuth } from "@/auth/AuthProvider";

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
  avatarUrl: "",
};

const oppositionOptions = obtenerNombresOposiciones();
const AVATAR_BUCKET = "profile-avatars";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);

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
  const extensionFromName = cleanName.includes(".") ? cleanName.split(".").pop() : "";
  const extensionFromType = file.type.startsWith("image/") ? file.type.replace("image/", "") : "";
  const extension = extensionFromName || extensionFromType || "jpg";
  const uniqueId = Math.random().toString(36).slice(2, 10);
  return `${userId}/${Date.now()}-${uniqueId}.${extension}`;
};

const MiPerfil = () => {
  const { toast } = useToast();
  const { user, isAuthReady } = useAuth();
  const [profile, setProfile] = useState<ProfileForm>(initialProfile);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingOpposition, setIsChangingOpposition] = useState(false);
  const [activeOpposition, setActiveOpposition] = useState("");
  const [isOppositionDialogOpen, setIsOppositionDialogOpen] = useState(false);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const avatarBlobPreviewRef = useRef<string | null>(null);

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

    if (!user) {
      setPendingAvatarFile(null);
      clearAvatarBlobPreview();
      setIsLoadingProfile(false);
      return;
    }

    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const resolvedOpposition = resolverNombreOposicion(String(metadata.preferred_opposition ?? ""));

    setProfile({
      firstName: String(metadata.first_name ?? ""),
      lastName: String(metadata.last_name ?? ""),
      email: user.email ?? "",
      age: metadata.age != null ? String(metadata.age) : "",
      preferredOpposition: resolvedOpposition,
      yearsPreparing: metadata.years_preparing != null ? String(metadata.years_preparing) : "",
      weeklyTargetHours: metadata.weekly_target_hours != null ? String(metadata.weekly_target_hours) : "16",
      testsPerWeek: metadata.tests_per_week != null ? String(metadata.tests_per_week) : "",
      mainChallenge: String(metadata.main_challenge ?? ""),
      avatarUrl: sanitizeAvatarForMetadata(String(metadata.avatar_url ?? "")),
    });
    setPendingAvatarFile(null);
    clearAvatarBlobPreview();
    setActiveOpposition(resolvedOpposition);
    setIsLoadingProfile(false);
  }, [isAuthReady, user]);

  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_AVATAR_BYTES) {
      toast({
        variant: "destructive",
        title: "Imagen demasiado pesada",
        description: "La imagen debe pesar menos de 2MB.",
      });
      return;
    }

    if (file.type && !ALLOWED_AVATAR_TYPES.has(file.type.toLowerCase())) {
      toast({
        variant: "destructive",
        title: "Formato no valido",
        description: "Usa PNG, JPG, WEBP o GIF.",
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
        title: "Sesion no valida",
        description: "Inicia sesion de nuevo para guardar el perfil.",
      });
      return;
    }

    if (!profile.firstName.trim() || !profile.lastName.trim()) {
      toast({
        variant: "destructive",
        title: "Faltan datos",
        description: "Completa nombre y apellidos para guardar el perfil.",
      });
      return;
    }

    setIsSavingProfile(true);

    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const currentAvatarInMetadata = sanitizeAvatarForMetadata(String(metadata.avatar_url ?? ""));
    let avatarUrlForMetadata = sanitizeAvatarForMetadata(profile.avatarUrl) || currentAvatarInMetadata;
    let uploadedAvatarPath: string | null = null;

    if (pendingAvatarFile) {
      uploadedAvatarPath = buildAvatarStoragePath(user.id, pendingAvatarFile);
      const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(uploadedAvatarPath, pendingAvatarFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: pendingAvatarFile.type || undefined,
      });

      if (uploadError) {
        toast({
          variant: "destructive",
          title: "No se pudo subir la imagen",
          description: uploadError.message,
        });
        setIsSavingProfile(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(uploadedAvatarPath);
      avatarUrlForMetadata = sanitizeAvatarForMetadata(publicUrlData.publicUrl);
    }

    const updateData: Record<string, unknown> = {
      first_name: profile.firstName.trim(),
      last_name: profile.lastName.trim(),
      full_name: `${profile.firstName.trim()} ${profile.lastName.trim()}`.trim(),
      age: Number(profile.age) || null,
      years_preparing: Number(profile.yearsPreparing) || null,
      weekly_target_hours: Number(profile.weeklyTargetHours) || 16,
      tests_per_week: Number(profile.testsPerWeek) || null,
      main_challenge: profile.mainChallenge.trim(),
    };

    if (avatarUrlForMetadata) {
      updateData.avatar_url = avatarUrlForMetadata;
    }

    const { error } = await supabase.auth.updateUser({
      data: updateData,
    });

    if (error) {
      if (uploadedAvatarPath) {
        await supabase.storage.from(AVATAR_BUCKET).remove([uploadedAvatarPath]);
      }
      toast({
        variant: "destructive",
        title: "No se pudo guardar el perfil",
        description: error.message,
      });
      setIsSavingProfile(false);
      return;
    }

    if (pendingAvatarFile) {
      const previousAvatarPath = extractAvatarStoragePath(currentAvatarInMetadata);
      if (previousAvatarPath && previousAvatarPath !== uploadedAvatarPath) {
        await supabase.storage.from(AVATAR_BUCKET).remove([previousAvatarPath]);
      }

      clearAvatarBlobPreview();
      setPendingAvatarFile(null);
      setProfile((prev) => ({ ...prev, avatarUrl: avatarUrlForMetadata }));
    }

    toast({
      title: "Perfil actualizado",
      description: "Tus datos de perfil se han guardado correctamente.",
    });
    setIsSavingProfile(false);
  };

  const handleOpenOppositionDialog = () => {
    const nextOpposition = resolverNombreOposicion(profile.preferredOpposition);

    if (!nextOpposition) {
      toast({
        variant: "destructive",
        title: "Selecciona una oposicion",
        description: "Debes elegir una oposicion valida antes de cambiar.",
      });
      return;
    }

    if (nextOpposition === activeOpposition) {
      toast({
        title: "Sin cambios",
        description: "Ya tienes seleccionada esta oposicion.",
      });
      return;
    }

    setIsOppositionDialogOpen(true);
  };

  const handleChangeOpposition = async () => {
    const nextOpposition = resolverNombreOposicion(profile.preferredOpposition);
    setIsChangingOpposition(true);

    const { error } = await supabase.auth.updateUser({
      data: {
        preferred_opposition: nextOpposition,
      },
    });

    if (error) {
      toast({
        variant: "destructive",
        title: "No se pudo cambiar la oposicion",
        description: error.message,
      });
      setIsChangingOpposition(false);
      return;
    }

    setActiveOpposition(nextOpposition);
    setProfile((prev) => ({ ...prev, preferredOpposition: nextOpposition }));
    setIsOppositionDialogOpen(false);
    toast({
      title: "Oposicion actualizada",
      description: "A partir de ahora, Test y Temario usaran esta oposicion.",
    });
    setIsChangingOpposition(false);
  };

  if (isLoadingProfile) {
    return (
      <div className="border border-border bg-background p-6">
        <p className="text-sm text-muted-foreground">Cargando perfil...</p>
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
                <img src={profile.avatarUrl} alt="Perfil" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full inline-flex items-center justify-center">
                  <User className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
                Mi perfil
              </p>
              <h1 className="text-2xl md:text-3xl font-serif text-foreground">
                {profile.firstName || "Usuario"} {profile.lastName}
              </h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                Gestiona tu informacion personal y de preparacion para adaptar toda la experiencia.
              </p>
              <label className="mt-3 inline-flex items-center gap-2 border border-border px-3 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-secondary transition-colors cursor-pointer">
                <Camera className="h-3.5 w-3.5" />
                Cambiar imagen
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
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
            {isSavingProfile ? "Guardando..." : "Guardar perfil"}
          </button>
        </div>
      </section>

      <section className="border border-border bg-background p-6 md:p-8">
        <div className="mb-5">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
            Datos de registro
          </p>
          <h2 className="text-xl font-serif text-foreground">Informacion del perfil</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
              Nombre
            </label>
            <input
              type="text"
              value={profile.firstName}
              onChange={(e) => setProfile((prev) => ({ ...prev, firstName: e.target.value }))}
              className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
            />
          </div>
          <div>
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
              Apellidos
            </label>
            <input
              type="text"
              value={profile.lastName}
              onChange={(e) => setProfile((prev) => ({ ...prev, lastName: e.target.value }))}
              className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
            />
          </div>
          <div>
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
              Email
            </label>
            <input
              type="email"
              value={profile.email}
              disabled
              className="w-full border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
            />
          </div>
          <div>
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
              Edad
            </label>
            <input
              type="number"
              min={16}
              max={75}
              value={profile.age}
              onChange={(e) => setProfile((prev) => ({ ...prev, age: e.target.value }))}
              className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
            />
          </div>
          <div>
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
              Anos opositando
            </label>
            <input
              type="number"
              min={0}
              max={40}
              value={profile.yearsPreparing}
              onChange={(e) => setProfile((prev) => ({ ...prev, yearsPreparing: e.target.value }))}
              className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
            />
          </div>
          <div>
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
              Horas objetivo / semana
            </label>
            <input
              type="number"
              min={1}
              max={80}
              value={profile.weeklyTargetHours}
              onChange={(e) => setProfile((prev) => ({ ...prev, weeklyTargetHours: e.target.value }))}
              className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
            />
          </div>
          <div>
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
              Tests por semana
            </label>
            <input
              type="number"
              min={1}
              max={14}
              value={profile.testsPerWeek}
              onChange={(e) => setProfile((prev) => ({ ...prev, testsPerWeek: e.target.value }))}
              className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
            Principal reto de estudio
          </label>
          <textarea
            rows={4}
            value={profile.mainChallenge}
            onChange={(e) => setProfile((prev) => ({ ...prev, mainChallenge: e.target.value }))}
            className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
            placeholder="Describe tu principal reto actual..."
          />
        </div>
      </section>

      <section className="border border-border bg-background p-6 md:p-8">
        <div className="mb-5">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
            Oposicion activa
          </p>
          <h2 className="text-xl font-serif text-foreground">Gestion de oposicion</h2>
        </div>

        <div className="rounded-xl border border-border bg-secondary/30 p-4">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
            Estudiando ahora
          </p>
          <p className="text-sm font-medium text-foreground mb-3">{activeOpposition || "No definida"}</p>

          <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
            Nueva oposicion
          </label>
          <select
            value={profile.preferredOpposition}
            onChange={(e) =>
              setProfile((prev) => ({
                ...prev,
                preferredOpposition: e.target.value,
              }))
            }
            className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
          >
            <option value="">Selecciona una opcion</option>
            {oppositionOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <p className="mt-3 text-xs text-muted-foreground">
            Si cambias de oposicion, los apartados de Test y Temario se ajustaran a la nueva seleccion.
          </p>

          <button
            type="button"
            onClick={handleOpenOppositionDialog}
            disabled={isChangingOpposition}
            className="mt-4 inline-flex items-center gap-2 bg-destructive text-destructive-foreground px-4 py-2.5 text-xs font-semibold tracking-widest uppercase hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {isChangingOpposition ? "Cambiando..." : "Cambiar"}
          </button>
        </div>
      </section>

      <ConfirmActionDialog
        open={isOppositionDialogOpen}
        onOpenChange={setIsOppositionDialogOpen}
        title="Confirmar cambio de oposicion"
        description={`Vas a cambiar tu oposicion activa a "${resolverNombreOposicion(profile.preferredOpposition)}". ¿Quieres continuar?`}
        confirmLabel={isChangingOpposition ? "Cambiando..." : "Confirmar cambio"}
        cancelLabel="Cancelar"
        confirmStyle="destructive"
        isLoading={isChangingOpposition}
        onConfirm={handleChangeOpposition}
      />
    </div>
  );
};

export default MiPerfil;

