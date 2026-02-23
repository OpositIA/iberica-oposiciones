import { useMemo, useState } from "react";
import { BookOpen, Search } from "lucide-react";
import {
  filtrarOposiciones,
  oposicionPerfilPorDefecto,
  oposicionesDisponibles,
} from "@/data/oposiciones";

const ProfileTemario = () => {
  const [busquedaTemario, setBusquedaTemario] = useState("");
  const [oposicionSeleccionada, setOposicionSeleccionada] = useState(oposicionPerfilPorDefecto);

  const oposicionesFiltradas = useMemo(
    () => filtrarOposiciones(busquedaTemario),
    [busquedaTemario],
  );

  const oposicionActiva = useMemo(
    () =>
      oposicionesDisponibles.find((item) => item.nombre === oposicionSeleccionada) ??
      oposicionesDisponibles[0],
    [oposicionSeleccionada],
  );

  return (
    <div className="space-y-4">
      <section className="border border-border bg-background/95 p-6 md:p-8">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
          Temario
        </p>
        <h2 className="text-xl md:text-2xl font-serif text-foreground mb-2">
          Temas por oposicion
        </h2>
        <p className="text-sm text-muted-foreground">
          Se carga por defecto la oposicion de tu perfil, pero puedes buscar cualquier otra.
        </p>
      </section>

      <section className="border border-border bg-background p-5">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2">
          Oposicion por defecto del perfil
        </p>
        <p className="text-sm text-foreground mb-4">{oposicionPerfilPorDefecto}</p>
        <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
          Buscar otra oposicion
        </label>
        <div className="relative">
          <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={busquedaTemario}
            onChange={(e) => setBusquedaTemario(e.target.value)}
            placeholder="Busca una oposicion para ver su temario"
            className="w-full border border-border bg-background pl-9 pr-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {oposicionesFiltradas.length === 0 && (
            <p className="text-sm text-muted-foreground">No hay resultados para esa busqueda.</p>
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
      </section>

      <section className="border border-border bg-background p-5">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="h-4 w-4 text-primary" />
          <h3 className="text-lg font-serif text-foreground">
            Listado de temas: {oposicionActiva.nombre}
          </h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">{oposicionActiva.cuerpo}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {oposicionActiva.temas.map((tema, idx) => (
            <div key={tema} className="border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground">
              Tema {idx + 1}. {tema}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ProfileTemario;
