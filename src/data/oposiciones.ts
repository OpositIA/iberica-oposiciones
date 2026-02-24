import i18n from "@/i18n/config";

export type Oposicion = {
  id: string;
  nombre: string;
  cuerpo: string;
  temas: string[];
};

type OposicionDefinition = {
  id: string;
  topicIds: string[];
  aliases: string[];
};

const oposicionesDefiniciones: OposicionDefinition[] = [
  {
    id: "auxilio-judicial",
    topicIds: [
      "constitutional",
      "judicial-organization",
      "civil-procedure",
      "criminal-procedure",
      "communication-acts",
      "civil-registry",
      "occupational-risk"
    ],
    aliases: ["Auxilio Judicial", "Judicial Assistance"]
  },
  {
    id: "tramitacion-procesal",
    topicIds: [
      "constitutional-rights",
      "judicial-office",
      "administrative-litigation",
      "labor-procedure",
      "judicial-documentation",
      "data-protection",
      "procedural-appeals"
    ],
    aliases: [
      "Tramitación Procesal",
      "Tramitacion Procesal",
      "Procedural Processing"
    ]
  },
  {
    id: "agente-hacienda",
    topicIds: [
      "constitutional-law",
      "general-administrative-law",
      "treasury-organization",
      "spanish-tax-system",
      "irpf-iva",
      "tax-collection",
      "inspection-sanctions"
    ],
    aliases: [
      "Agente de Hacienda",
      "Tax Agency Officer",
      "Técnico de Hacienda",
      "Tecnico de Hacienda"
    ]
  },
  {
    id: "administrativo-estado",
    topicIds: [
      "constitution-eu",
      "civil-service",
      "law-39-40",
      "personnel-management",
      "public-procurement",
      "financial-management",
      "office-electronic-admin"
    ],
    aliases: [
      "Administrativo del Estado",
      "State Administrative Officer",
      "Auxiliar Administrativo del Estado"
    ]
  }
];

const oposicionPorDefectoId = "auxilio-judicial";

export const oposicionPerfilPorDefecto = "Auxilio Judicial";

const aliasOposiciones: Record<string, string> = {
  "auxiliar administrativo del estado": "administrativo-estado",
  "administracion local": "administrativo-estado",
  "gestion de la seguridad social": "administrativo-estado",
  "tramitacion procesal": "tramitacion-procesal",
  "tecnico de hacienda": "agente-hacienda",
  "auxilio judicial": "auxilio-judicial"
};

export const normalizarTexto = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const traducir = (key: string) => i18n.t(key, { ns: "oppositions" }) as string;

const obtenerDefinicionPorId = (id: string) =>
  oposicionesDefiniciones.find((oposicion) => oposicion.id === id) ??
  oposicionesDefiniciones[0];

const construirOposicion = (id: string): Oposicion => {
  const definicion = obtenerDefinicionPorId(id);
  return {
    id: definicion.id,
    nombre: traducir(`${definicion.id}.name`),
    cuerpo: traducir(`${definicion.id}.body`),
    temas: definicion.topicIds.map((topicId) =>
      traducir(`${definicion.id}.topics.${topicId}`)
    )
  };
};

const resolverIdOposicion = (value: string | null | undefined) => {
  const normalized = normalizarTexto(String(value ?? "").trim());
  if (!normalized) return oposicionPorDefectoId;

  const porAlias = aliasOposiciones[normalized];
  if (porAlias) return porAlias;

  const porId = oposicionesDefiniciones.find(
    (oposicion) => normalizarTexto(oposicion.id) === normalized
  );
  if (porId) return porId.id;

  for (const oposicion of oposicionesDefiniciones) {
    const aliases = oposicion.aliases.map(normalizarTexto);
    const nombreActual = normalizarTexto(traducir(`${oposicion.id}.name`));
    if (aliases.includes(normalized) || nombreActual === normalized)
      return oposicion.id;
  }

  return oposicionPorDefectoId;
};

export const obtenerNombresOposiciones = () =>
  oposicionesDefiniciones.map((oposicion) => traducir(`${oposicion.id}.name`));

export const resolverNombreOposicion = (value: string | null | undefined) => {
  const id = resolverIdOposicion(value);
  return traducir(`${id}.name`);
};

export const resolverOposicionPorNombre = (
  value: string | null | undefined
) => {
  const id = resolverIdOposicion(value);
  return construirOposicion(id);
};

export const filtrarOposiciones = (termino: string) => {
  const query = normalizarTexto(termino.trim());
  const oposiciones = oposicionesDefiniciones.map((oposicion) =>
    construirOposicion(oposicion.id)
  );
  if (!query) return oposiciones;

  return oposiciones.filter((oposicion) => {
    const nombre = normalizarTexto(oposicion.nombre);
    const cuerpo = normalizarTexto(oposicion.cuerpo);
    return nombre.includes(query) || cuerpo.includes(query);
  });
};

export const obtenerOposicionesDisponibles = () =>
  oposicionesDefiniciones.map((oposicion) => construirOposicion(oposicion.id));
