import { CalendarDays, Clock3 } from "lucide-react";

const bloques = [
  { dia: "Lunes", actividad: "Repaso Tema 1-2", hora: "19:00 - 20:30" },
  { dia: "Miercoles", actividad: "Test rapido Tema 3", hora: "19:30 - 20:00" },
  { dia: "Viernes", actividad: "Simulacro general", hora: "18:30 - 19:30" },
];

const ProfileCalendario = () => {
  return (
    <div className="space-y-4">
      <section className="border border-border bg-background/95 p-6 md:p-8">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
          Calendario
        </p>
        <h2 className="text-xl md:text-2xl font-serif text-foreground mb-2">Plan semanal</h2>
        <p className="text-sm text-muted-foreground">
          Organiza tus bloques de estudio y revisa los proximos hitos de preparacion.
        </p>
      </section>

      <section className="border border-border bg-background p-5">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays className="h-4 w-4 text-primary" />
          <h3 className="text-lg font-serif text-foreground">Proximas sesiones</h3>
        </div>
        <div className="space-y-2">
          {bloques.map((bloque) => (
            <div key={`${bloque.dia}-${bloque.actividad}`} className="border border-border bg-secondary/30 p-3">
              <p className="text-sm font-semibold text-foreground">{bloque.dia}</p>
              <p className="text-sm text-muted-foreground">{bloque.actividad}</p>
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
