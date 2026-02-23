export type Oposicion = {
  id: string;
  nombre: string;
  cuerpo: string;
  temas: string[];
};

export const oposicionPerfilPorDefecto = "Auxilio Judicial";

export const oposicionesDisponibles: Oposicion[] = [
  {
    id: "auxilio-judicial",
    nombre: "Auxilio Judicial",
    cuerpo: "Administracion de Justicia",
    temas: [
      "Constitucion Espanola",
      "Organizacion Judicial",
      "Procedimiento Civil",
      "Procedimiento Penal",
      "Actos de comunicacion",
      "Registro Civil",
      "Prevencion de riesgos laborales",
    ],
  },
  {
    id: "tramitacion-procesal",
    nombre: "Tramitacion Procesal",
    cuerpo: "Administracion de Justicia",
    temas: [
      "Constitucion y Derechos Fundamentales",
      "Oficina Judicial",
      "Procedimiento Contencioso-Administrativo",
      "Procedimiento Laboral",
      "Documentacion judicial",
      "Proteccion de datos",
      "Recursos procesales",
    ],
  },
  {
    id: "agente-hacienda",
    nombre: "Agente de Hacienda",
    cuerpo: "Agencia Tributaria",
    temas: [
      "Derecho Constitucional",
      "Derecho Administrativo General",
      "Organizacion de la Hacienda Publica",
      "Sistema Tributario Espanol",
      "IRPF e IVA",
      "Recaudacion tributaria",
      "Inspeccion y sanciones",
    ],
  },
  {
    id: "administrativo-estado",
    nombre: "Administrativo del Estado",
    cuerpo: "Administracion General del Estado",
    temas: [
      "Constitucion y Union Europea",
      "Funcion publica",
      "Ley 39/2015 y 40/2015",
      "Gestion de personal",
      "Contratacion publica",
      "Gestion financiera",
      "Ofimatica y administracion electronica",
    ],
  },
];

export const normalizarTexto = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const filtrarOposiciones = (termino: string) => {
  const query = normalizarTexto(termino.trim());
  if (!query) return oposicionesDisponibles;

  return oposicionesDisponibles.filter((oposicion) => {
    const nombre = normalizarTexto(oposicion.nombre);
    const cuerpo = normalizarTexto(oposicion.cuerpo);
    return nombre.includes(query) || cuerpo.includes(query);
  });
};
