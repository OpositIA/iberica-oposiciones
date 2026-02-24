import { useEffect, useState } from "react";
import { ArrowRight, FileText, ListChecks } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { oposicionesDisponibles, resolverOposicionPorNombre } from "@/data/oposiciones";
import { useAuth } from "@/auth/AuthProvider";

const ProfileTest = () => {
  const { toast } = useToast();
  const { user, isAuthReady } = useAuth();
  const [oposicionActiva, setOposicionActiva] = useState(oposicionesDisponibles[0]);
  const [temaSeleccionado, setTemaSeleccionado] = useState("");
  const [isLoadingOpposition, setIsLoadingOpposition] = useState(true);

  useEffect(() => {
    if (!isAuthReady) return;

    if (!user) {
      setIsLoadingOpposition(false);
      return;
    }

    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const preferredOpposition = String(metadata.preferred_opposition ?? "");
    const resolved = resolverOposicionPorNombre(preferredOpposition);
    setOposicionActiva(resolved);
    setTemaSeleccionado(resolved.temas[0] ?? "");
    setIsLoadingOpposition(false);
  }, [isAuthReady, user]);

  const iniciarSimulacro = () => {
    toast({
      title: "Simulacro preparado",
      description: `Vas a iniciar un simulacro general de ${oposicionActiva.nombre}.`,
    });
  };

  const iniciarTestRapido = () => {
    if (!temaSeleccionado) {
      toast({
        variant: "destructive",
        title: "Selecciona un tema",
        description: "Elige un tema antes de lanzar el test rapido.",
      });
      return;
    }

    toast({
      title: "Test rapido preparado",
      description: `Tema seleccionado: ${temaSeleccionado}.`,
    });
  };

  if (isLoadingOpposition) {
    return (
      <div className="border border-border bg-background p-6">
        <p className="text-sm text-muted-foreground">Cargando oposicion...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="border border-border bg-background/95 p-6 md:p-8">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
          Test
        </p>
        <h2 className="text-xl md:text-2xl font-serif text-foreground mb-2">Tests de tu oposicion</h2>
        <p className="text-sm text-muted-foreground">
          Solo veras y practicaras con la oposicion activa en tu perfil.
        </p>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-border bg-background p-5 space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Modo Simulacro</p>
          </div>
          <p className="text-xs text-muted-foreground">Oposicion activa: {oposicionActiva.nombre}</p>
          <button
            type="button"
            onClick={iniciarSimulacro}
            className="w-full border border-border px-4 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-secondary transition-colors"
          >
            Hacer simulacro de test
          </button>
        </div>

        <div className="border border-border bg-background p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Modo Rapido por tema</p>
          </div>
          <p className="text-xs text-muted-foreground">Selecciona tema de {oposicionActiva.nombre}</p>
          <button
            type="button"
            onClick={iniciarTestRapido}
            className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={!temaSeleccionado}
          >
            Lanzar test rapido
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <section className="border border-border bg-background p-5">
        <div className="mb-3">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
            Temas para test rapido
          </p>
          <p className="text-sm text-foreground">Selecciona un tema de {oposicionActiva.nombre}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {oposicionActiva.temas.map((tema) => (
            <button
              key={tema}
              type="button"
              onClick={() => setTemaSeleccionado(tema)}
              className={`px-3 py-1.5 text-xs border transition-colors ${
                tema === temaSeleccionado
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              {tema}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ProfileTest;
