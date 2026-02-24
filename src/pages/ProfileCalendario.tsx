import { CalendarDays, Clock3 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

const ProfileCalendario = () => {
  const { t } = useTranslation("profile");

  const bloques = useMemo(
    () => [
      {
        id: "monday",
        dia: t("calendar.blocks.monday.day"),
        actividad: t("calendar.blocks.monday.activity"),
        hora: t("calendar.blocks.monday.time")
      },
      {
        id: "wednesday",
        dia: t("calendar.blocks.wednesday.day"),
        actividad: t("calendar.blocks.wednesday.activity"),
        hora: t("calendar.blocks.wednesday.time")
      },
      {
        id: "friday",
        dia: t("calendar.blocks.friday.day"),
        actividad: t("calendar.blocks.friday.activity"),
        hora: t("calendar.blocks.friday.time")
      }
    ],
    [t]
  );

  return (
    <div className="space-y-4">
      <section className="border border-border bg-background/95 p-6 md:p-8">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
          {t("calendar.badge")}
        </p>
        <h2 className="text-xl md:text-2xl font-serif text-foreground mb-2">
          {t("calendar.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("calendar.description")}
        </p>
      </section>

      <section className="border border-border bg-background p-5">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays className="h-4 w-4 text-primary" />
          <h3 className="text-lg font-serif text-foreground">
            {t("calendar.upcomingSessions")}
          </h3>
        </div>
        <div className="space-y-2">
          {bloques.map((bloque) => (
            <div
              key={bloque.id}
              className="border border-border bg-secondary/30 p-3"
            >
              <p className="text-sm font-semibold text-foreground">
                {bloque.dia}
              </p>
              <p className="text-sm text-muted-foreground">
                {bloque.actividad}
              </p>
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1 mt-1">
                <Clock3 className="h-3.5 w-3.5" />
                {bloque.hora}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ProfileCalendario;
