import { useAuth } from "@/auth/AuthProvider";
import { resolverOposicionPorNombre } from "@/data/oposiciones";
import { supabase } from "@/integrations/supabase/client";
import { runSingleFlight } from "@/lib/singleFlight";
import { BookOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const ProfileTemario = () => {
  const { t } = useTranslation(["profile", "oppositions"]);
  const { user, isAuthReady } = useAuth();
  const [oposicionActiva, setOposicionActiva] = useState(() =>
    resolverOposicionPorNombre(null)
  );
  const [isLoadingOpposition, setIsLoadingOpposition] = useState(true);

  useEffect(() => {
    if (!isAuthReady) return;
    const userId = user?.id;

    if (!userId) {
      setIsLoadingOpposition(false);
      return;
    }

    let isMounted = true;

    const loadPreferredOpposition = async () => {
      const { data } = await runSingleFlight(
        `profile-temario:preferred-opposition:${userId}`,
        () =>
          supabase
            .from("profiles")
            .select("preferred_opposition")
            .eq("user_id", userId)
            .maybeSingle(),
        { reuseResultForMs: 1500 }
      );

      if (!isMounted) return;

      const resolved = resolverOposicionPorNombre(data?.preferred_opposition);
      setOposicionActiva(resolved);
      setIsLoadingOpposition(false);
    };

    void loadPreferredOpposition();

    return () => {
      isMounted = false;
    };
  }, [isAuthReady, user?.id]);

  if (isLoadingOpposition) {
    return (
      <div className="border border-border bg-background p-6">
        <p className="text-sm text-muted-foreground">{t("syllabus.loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="border border-border bg-background/95 p-6 md:p-8">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
          {t("syllabus.badge")}
        </p>
        <h2 className="text-xl md:text-2xl font-serif text-foreground mb-2">
          {t("syllabus.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("syllabus.description")}
        </p>
      </section>

      <section className="border border-border bg-background p-5">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2">
          {t("syllabus.activeOpposition")}
        </p>
        <p className="text-sm font-medium text-foreground">
          {oposicionActiva.nombre}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {oposicionActiva.cuerpo}
        </p>
      </section>

      <section className="border border-border bg-background p-5">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="h-4 w-4 text-primary" />
          <h3 className="text-lg font-serif text-foreground">
            {t("syllabus.topicsList")}
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {oposicionActiva.temas.map((tema, idx) => (
            <div
              key={tema}
              className="border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground"
            >
              {t("syllabus.topicItem", { index: idx + 1, topic: tema })}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ProfileTemario;
