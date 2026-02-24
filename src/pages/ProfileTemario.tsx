import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { oposicionesDisponibles, resolverOposicionPorNombre } from "@/data/oposiciones";
import { useAuth } from "@/auth/AuthProvider";

const ProfileTemario = () => {
  const { user, isAuthReady } = useAuth();
  const [oposicionActiva, setOposicionActiva] = useState(oposicionesDisponibles[0]);
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
    setIsLoadingOpposition(false);
  }, [isAuthReady, user]);

  if (isLoadingOpposition) {
    return (
      <div className="border border-border bg-background p-6">
        <p className="text-sm text-muted-foreground">Cargando temario...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="border border-border bg-background/95 p-6 md:p-8">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
          Temario
        </p>
        <h2 className="text-xl md:text-2xl font-serif text-foreground mb-2">
          Temario de tu oposicion
        </h2>
        <p className="text-sm text-muted-foreground">
          Se muestra unicamente la oposicion activa de tu perfil.
        </p>
      </section>

      <section className="border border-border bg-background p-5">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2">
          Oposicion activa
        </p>
        <p className="text-sm font-medium text-foreground">{oposicionActiva.nombre}</p>
        <p className="text-xs text-muted-foreground mt-1">{oposicionActiva.cuerpo}</p>
      </section>

      <section className="border border-border bg-background p-5">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="h-4 w-4 text-primary" />
          <h3 className="text-lg font-serif text-foreground">Listado de temas</h3>
        </div>
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
