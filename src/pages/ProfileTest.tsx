import { useEffect, useMemo, useState } from "react";
import { ArrowRight, FileText, ListChecks, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  filtrarOposiciones,
  oposicionPerfilPorDefecto,
  oposicionesDisponibles,
} from "@/data/oposiciones";

const ProfileTest = () => {
  const { toast } = useToast();
  const [busquedaTest, setBusquedaTest] = useState("");
  const [oposicionSeleccionada, setOposicionSeleccionada] = useState(oposicionPerfilPorDefecto);
  const [temaSeleccionado, setTemaSeleccionado] = useState("");

  const oposicionesFiltradas = useMemo(
    () => filtrarOposiciones(busquedaTest),
    [busquedaTest],
  );

  const oposicionActiva = useMemo(
    () =>
      oposicionesDisponibles.find((item) => item.nombre === oposicionSeleccionada) ??
      oposicionesDisponibles[0],
    [oposicionSeleccionada],
  );

  useEffect(() => {
    setTemaSeleccionado(oposicionActiva.temas[0] ?? "");
  }, [oposicionActiva]);

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

  return (
    <div className="space-y-4">
      <section className="border border-border bg-background/95 p-6 md:p-8">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
          Test
        </p>
        <h2 className="text-xl md:text-2xl font-serif text-foreground mb-2">Tests por oposicion</h2>
        <p className="text-sm text-muted-foreground">
          Busca oposiciones y elige entre simulacro general o test rapido por tema.
        </p>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-border bg-background p-5">
          <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
            Buscar test por oposicion
          </label>
          <div className="relative">
            <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={busquedaTest}
              onChange={(e) => setBusquedaTest(e.target.value)}
              placeholder="Ejemplo: justicia, hacienda..."
              className="w-full border border-border bg-background pl-9 pr-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {oposicionesFiltradas.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No se han encontrado oposiciones con esa busqueda.
              </p>
            )}
            {oposicionesFiltradas.map((oposicion) => (
              <button
                key={oposicion.id}
                type="button"
                onClick={() => setOposicionSeleccionada(oposicion.nombre)}
                className={`px-3 py-1.5 text-xs font-semibold tracking-wide border transition-colors ${
                  oposicionSeleccionada === oposicion.nombre
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                {oposicion.nombre}
              </button>
            ))}
          </div>
        </div>

        <div className="border border-border bg-background p-5 space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Modo Simulacro</p>
          </div>
          <button
            type="button"
            onClick={iniciarSimulacro}
            className="w-full border border-border px-4 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-secondary transition-colors"
          >
            Hacer simulacro de test
          </button>
          <div className="h-px bg-border" />
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Modo Rapido por tema</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Oposicion activa: {oposicionActiva.nombre}
          </p>
        </div>
      </section>

      <section className="border border-border bg-background p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
              Temas para test rapido
            </p>
            <p className="text-sm text-foreground">Selecciona un tema de {oposicionActiva.nombre}</p>
          </div>
          <button
            type="button"
            onClick={iniciarTestRapido}
            className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={!temaSeleccionado}
          >
            Lanzar test rapido
            <ArrowRight className="h-4 w-4" />
          </button>
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
