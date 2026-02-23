import { BarChart3, Clock3, Target } from "lucide-react";

const metrics = [
  { label: "Tests completados", value: "148" },
  { label: "Media global", value: "7.5/10" },
  { label: "Precision media", value: "79%" },
];

const ProfileEstadisticas = () => {
  return (
    <div className="space-y-4">
      <section className="border border-border bg-background/95 p-6 md:p-8">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
          Estadisticas
        </p>
        <h2 className="text-xl md:text-2xl font-serif text-foreground mb-2">
          Rendimiento de estudio
        </h2>
        <p className="text-sm text-muted-foreground">
          Monitoriza tu progreso y ajusta estrategia segun tus datos de practica.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="border border-border bg-background p-5">
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2">
              {metric.label}
            </p>
            <p className="text-2xl font-serif text-foreground">{metric.value}</p>
          </div>
        ))}
      </section>

      <section className="border border-border bg-background p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="border border-border bg-secondary/30 p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Tendencia</p>
            <p className="text-sm text-foreground inline-flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Positiva en las ultimas 2 semanas
            </p>
          </div>
          <div className="border border-border bg-secondary/30 p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Foco</p>
            <p className="text-sm text-foreground inline-flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Reforzar procedimiento administrativo
            </p>
          </div>
          <div className="border border-border bg-secondary/30 p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Tiempo medio</p>
            <p className="text-sm text-foreground inline-flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-primary" />
              32 min por test
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ProfileEstadisticas;
