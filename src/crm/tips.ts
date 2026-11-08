/** Textos de los ⓘ del tracker de la SDR y de la vista del closer: qué es cada dato y qué cargar. */

export const LEAD_TIPS = {
  // Tarjeta del lead (tracker de la SDR)
  level: 'Prioridad del lead según lo que invierte por día en Meta y si calificó: Alto, Medio o Potencial. Trabajá primero los Altos.',
  stage: 'Pre-clase hasta que pasa la clase del lanzamiento; después, Post-clase (o antes, si ya aplicó). Se calcula solo.',
  optin: 'Fecha en la que se registró en la landing. Viene sola, no se carga.',
  origin: 'Fuente y versión de la landing por la que entró. Viene sola de la landing.',
  group: 'Si tocó «Entrar al grupo» de WhatsApp de la clase. Viene solo.',
  application: 'Lo que respondió en la aplicación post-clase sobre su inversión. El closer ve todas las respuestas en la ficha.',
  dials: 'Cada intento de contacto (llamada o mensaje). Después de cada intento tocá «Atendió» o «No atendió»; con «−» corregís si te equivocaste.',
  answered: 'Marcá «Sí» cuando el lead te responda por primera vez (llamada o WhatsApp). Si no contesta, queda en seguimiento según la cadencia.',
  realConversation: '¿Pudieron hablar de verdad de su negocio, más allá de un «hola»? Marcá «Sí» si llegaste a hacerle las preguntas de calificación.',
  qualified: 'Tu evaluación después de hablar: ¿tiene el negocio, la inversión y las ganas para el programa? Dejá «—» si todavía no lo sabés.',
  readiness: '«Listo para agendar» si ya puede tener la call con el closer. «Todavía no» lo manda a nutrición: te vuelve a aparecer en seguimientos.',
  askedAgents: 'Marcá «Sí» si pidió los 3 agentes de IA. Mandáselos con el botón «Agentes»: queda registrado cuáles y cuándo.',
  notes: 'Contexto para el closer: a qué se dedica, qué le interesa, objeciones. Se guarda al salir del campo y el closer lo lee antes de la call.',
  book: '«¡Lo agendé!»: elegí closer, fecha y hora de la call. «No agendó»: calificó pero no quiso agendar, y pasa a seguimiento.',
  followup: 'Elegí cada cuánto te vuelve a aparecer el lead. Después de cada seguimiento, tocá si respondió o no y se programa el próximo.',
  finalize: 'Cerralo cuando ya no hay nada más que hacer, eligiendo el motivo. Sale de tus listas, pero se puede reabrir.',
  noCuenta: 'Para duplicados, datos falsos o pruebas. No suma en las métricas de nadie.',
  release: 'Lo devuelve a «Por asignar» para que lo tome otra SDR.',
  timeline: 'Todo lo que pasó con el lead, con autor y fecha: dials, cambios de estado, agendas, notas.',
} as const;

/** Columnas de la lista de leads. */
export const LEAD_COLUMN_TIPS: Record<string, string> = {
  Lead: 'Nombre y mail (o teléfono) del lead. Tocá la fila para abrir la ficha.',
  WhatsApp: 'Abre el chat de WhatsApp con el lead.',
  Inversión: 'Lo que dijo que invierte por día en Meta en la landing. «Califica» = 100 USD por día o más.',
  Landing: 'Versión de la landing y fuente por la que se registró. Viene sola.',
  Grupo: 'Si entró al grupo de WhatsApp de la clase.',
  Aplicó: 'Si completó la aplicación post-clase. «Próximo ciclo»: aplicó pero no pasó el filtro para este lanzamiento.',
  SDR: 'SDR que trabaja el lead. «Sin asignar»: todavía no lo tomó nadie.',
  Closer: 'Closer con el que tiene (o tuvo) la call.',
  Estado: 'En qué parte del embudo está: Nuevo lead, No atendió, Agendado, No se cerró o Cliente. Se actualiza solo con lo que cargan la SDR y el closer.',
  'Próxima tarea': 'Qué hay que hacer con el lead y cuándo. Aparece en naranja si ya se pasó la fecha.',
};

export const CALL_TIPS = {
  // Lista de calls del closer
  lead: 'Nombre del lead y lo que invierte por día en Meta. Tocá la fila para abrir la call.',
  whatsapp: 'Abre el chat de WhatsApp con el lead.',
  when: 'Fecha y hora de la call (hora de tu compu o celular).',
  state: 'Cómo está la call: Agendada, Pasó sin marcar, Se presentó, No-show, Canceló, Seguimiento, Venta o No cerró.',
  followup: 'Cuándo quedaste en volver a contactarlo. En naranja si ya se pasó.',
  // Ficha de la call
  sdrNotes: 'Lo que cargó la SDR sobre el lead: contexto, intereses, objeciones. Leelo antes de la call.',
  attendance: 'Después de la hora de la call, marcá si se presentó, no se presentó (no-show) o canceló. Si reagendó, cargá la nueva fecha.',
  result: 'Si se presentó, cargá cómo terminó: «Cerró» (venta), «Seguimiento» (quedaron en hablar) o «No cerró».',
  program: 'Programa que compró (Genesis OS, Genesis OG, Genesis Lite…).',
  amount: 'Monto total de la venta, aunque lo pague en cuotas.',
  currency: 'Moneda de la venta, en 3 letras (USD, ARS…).',
  payments: 'Lo que pagó hoy. Si pagó con más de un medio, sumá una fila por cada uno. El comprobante es opcional.',
  quotas: 'Lo que falta cobrar, en cuotas cada 30 días. Podés cambiar los montos y las fechas.',
  saleNote: 'Acuerdos de la venta: plan de pagos, bonos, lo que le prometiste.',
  followupAt: 'Cuándo vas a volver a contactarlo. Te aparece en Follow-ups.',
  noCloseNote: 'Por qué no compró. Sirve para mejorar el pitch y para la SDR.',
  sale: 'Venta cargada: monto total, lo cobrado y lo que falta en cuotas. Con «Registrar pago» se descuenta de las cuotas.',
} as const;
