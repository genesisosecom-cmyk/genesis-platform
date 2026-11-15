/**
 * Formulario de onboarding de clientes nuevos de Genesis.
 *
 * Basado en el onboarding de Limitless (pasos con varias preguntas, "Hacelo hoy",
 * "si no lo tenés poné 'no lo tengo'"), adaptado a ecommerce: algunos pasos y
 * preguntas solo aparecen según la etapa en la que está el alumno.
 *
 * Los `id` son las claves con las que se guardan las respuestas: no cambiarlos
 * una vez que haya respuestas (cambiar textos sí se puede).
 */
import { PROGRAMS } from '../data/schedule';

export interface Person {
  role: string;
  name: string;
  pay: string;
  score: string;
  why: string;
}

export type Answer = string | number | string[] | Person[];
export type Answers = Record<string, Answer>;

export type OnbType =
  | 'text'
  | 'textarea'
  /** Lista desplegable (una opción). */
  | 'dropdown'
  /** Botones, una opción. */
  | 'chips'
  /** Botones, varias opciones (hasta `max`). */
  | 'multi'
  | 'scale'
  /** Lista de personas del equipo. */
  | 'people';

export interface OnbQuestion {
  id: string;
  label: string;
  type: OnbType;
  /** Por defecto todas son obligatorias, como en el original. */
  optional?: boolean;
  help?: string;
  placeholder?: string;
  options?: string[];
  /** multi: máximo de opciones elegibles. */
  max?: number;
  /** scale: rango y textos de los extremos. */
  min?: number;
  top?: number;
  minLabel?: string;
  maxLabel?: string;
  showIf?: (a: Answers) => boolean;
}

export interface OnbStep {
  id: string;
  title: string;
  subtitle?: string;
  /** Pasos que destraban el trabajo del equipo: se piden para hoy. */
  today?: boolean;
  showIf?: (a: Answers) => boolean;
  questions: OnbQuestion[];
}

export const ONBOARDING_PROGRAMS = [...PROGRAMS, 'Fast Subscription'];

// ---------- Etapa del negocio (decide qué pasos se muestran) ----------

export const STAGES = [
  'Todavía no tengo tienda ni producto',
  'Tengo el producto o la tienda armada pero todavía no vendo',
  'Vendo menos de USD 1.000 por mes',
  'Vendo entre USD 1.000 y 10.000 por mes',
  'Vendo entre USD 10.000 y 50.000 por mes',
  'Vendo más de USD 50.000 por mes',
];

const stageIndex = (a: Answers) => STAGES.indexOf(String(a.etapa ?? ''));
/** Ya tiene un producto o tienda (aunque no venda). */
export const hasStore = (a: Answers) => stageIndex(a) >= 1;
/** Ya factura. */
export const isSelling = (a: Answers) => stageIndex(a) >= 2;
const yes = (id: string) => (a: Answers) => a[id] === 'Sí';

const NO_LO_TENGO = 'Si no lo tenés, poné "no lo tengo".';

export const STEPS: OnbStep[] = [
  {
    id: 'datos',
    title: 'Datos básicos',
    subtitle: 'Para tener tu ficha completa.',
    questions: [
      { id: 'nombre', label: '¿Cuál es tu nombre y apellido?', type: 'text' },
      { id: 'whatsapp', label: 'Teléfono (WhatsApp)', type: 'text', placeholder: '+54 9 11 1234 5678', help: 'Con código de país.' },
      {
        id: 'pais',
        label: '¿De dónde sos?',
        type: 'dropdown',
        options: ['Argentina', 'Uruguay', 'Chile', 'Paraguay', 'Bolivia', 'Perú', 'Colombia', 'Ecuador', 'Venezuela', 'México', 'España', 'Estados Unidos', 'Otro'],
      },
      { id: 'ciudad', label: '¿En qué ciudad vivís?', type: 'text' },
      { id: 'discord', label: 'Tu usuario de Discord', type: 'text', help: 'Así te encontramos en la comunidad. Si todavía no tenés, poné "no lo tengo".' },
      {
        id: 'rol',
        label: '¿Con cuál rol te sentís más identificado?',
        type: 'dropdown',
        options: [
          'Arranco de cero en ecommerce',
          'Tengo un trabajo y quiero armar mi marca en paralelo',
          'Ya tengo una marca y quiero escalarla',
          'Tengo un negocio físico y quiero llevarlo online',
          'Trabajo para marcas (agencia, freelance, trafficker)',
          'Otro',
        ],
      },
    ],
  },
  {
    id: 'decision',
    title: 'Decisión de compra',
    subtitle: 'Nos ayuda a entender qué te trajo y qué podemos mejorar.',
    questions: [
      {
        id: 'que_te_hizo_entrar',
        label: '¿Qué te hizo finalmente decir "sí" y entrar a Genesis?',
        type: 'dropdown',
        options: [
          'Las clases en vivo del lanzamiento',
          'El contenido de Manu en redes',
          'Los resultados de otros alumnos',
          'La llamada con el closer',
          'La recomendación de alguien que conozco',
          'El precio / la forma de pago',
          'Otro',
        ],
      },
      { id: 'motivo_accion', label: '¿Qué te motivó específicamente a tomar acción?', type: 'textarea', help: 'Desarrollá tu respuesta anterior: es clave para entender cómo ayudarte.' },
      {
        id: 'tiempo_decision',
        label: '¿Cuánto tiempo tardaste en decidirte a entrar?',
        type: 'dropdown',
        options: ['Lo decidí en la llamada', 'Menos de una semana', 'Entre 1 y 4 semanas', 'Entre 1 y 3 meses', 'Más de 3 meses (te sigo hace rato)'],
      },
      {
        id: 'que_funcionaria_mejor',
        label: '¿Qué creés que podría haber funcionado mejor para que te decidieras antes?',
        type: 'multi',
        options: [
          'Mejor llamada de venta',
          'Mejor seguimiento por WhatsApp',
          'Más contenido de valor',
          'Más testimonios o casos de éxito',
          'Conocer más el programa por dentro',
          'Más claridad sobre precio y cuotas',
          'Ninguna: me decidí apenas los conocí',
        ],
      },
      {
        id: 'que_mejorar',
        label: '¿Qué aspecto de lo que elegiste antes creés que se podría mejorar?',
        type: 'textarea',
        optional: true,
        help: 'Claridad en la oferta, el programa por dentro, más contenido, comunicación, etc.',
      },
      { id: 'convencido', label: 'Antes de la llamada, ¿qué tan convencido estabas de entrar, del 1 al 10?', type: 'scale', min: 1, top: 10, minLabel: 'Nada convencido', maxLabel: 'Totalmente convencido' },
      {
        id: 'ultimo_convencio',
        label: '¿Qué fue lo último que te convenció para tomar la decisión?',
        type: 'textarea',
        help: 'Ej: vi el caso de un alumno que arrancó igual que yo; en la llamada me dieron claridad sobre cómo validar mi primer producto.',
      },
      {
        id: 'frenos',
        label: '¿Qué era lo que te frenaba para comprar?',
        type: 'multi',
        options: ['Precio', 'Confianza', 'Tiempo', 'Falta de claridad sobre el programa', 'Miedo a no poder aplicarlo', 'Nada, no me frenaba nada'],
      },
    ],
  },
  {
    id: 'situacion',
    title: 'Tu situación y tu dolor',
    questions: [
      {
        id: 'problemas',
        label: '¿Cuáles eran tus principales problemas cuando buscaste ayuda?',
        type: 'multi',
        max: 3,
        options: [
          'No sé qué producto vender',
          'No sé cómo validar un producto',
          'No sé hacer publicidad (Meta / TikTok Ads)',
          'Vendo pero no es rentable',
          'Estoy estancado en la misma facturación',
          'No sé conseguir proveedores o importar',
          'Logística y envíos',
          'No tengo tiempo, todo depende de mí',
          'Dependo de un solo canal o producto',
          'Me falta capital',
          'Falta de sistemas, métricas o equipo',
          'Retención y recompra (suscripciones)',
        ],
      },
      { id: 'problema_principal', label: 'De esos problemas, ¿cuál es el que más te pesa hoy y por qué?', type: 'textarea' },
      { id: 'afecta_dia', label: '¿Cómo te afecta en el día a día?', type: 'textarea', help: 'Ej: trabajo 10 horas en otra cosa y no llego a avanzar; invierto en ads y pierdo plata.' },
      { id: 'por_que_ahora', label: '¿Por qué ahora? ¿Qué pasó que te hizo buscar ayuda en este momento?', type: 'textarea' },
      {
        id: 'probado_antes',
        label: 'Antes de entrar a Genesis, ¿qué probaste para resolverlo y por qué no funcionó?',
        type: 'textarea',
        help: 'Cursos, mentorías, agencias o cosas que probaste por tu cuenta.',
      },
      { id: 'seis_meses_igual', label: 'Si en 6 meses seguís exactamente igual que hoy, ¿qué pasa?', type: 'textarea' },
      { id: 'miedos', label: '¿Qué es lo que más miedo o dudas te genera de lo que viene?', type: 'textarea', help: 'Ej: no tener tiempo para ejecutar, invertir en ads y perder la plata, elegir mal el producto.' },
    ],
  },
  {
    id: 'objetivos',
    title: 'Objetivos en el programa',
    questions: [
      { id: 'programa', label: '¿Qué programa compraste?', type: 'dropdown', options: ONBOARDING_PROGRAMS },
      { id: 'tres_cosas', label: '¿Qué 3 cosas querés tener resueltas cuando termines el programa?', type: 'textarea', help: 'Ej: tener mi primer producto validado, una campaña de Meta rentable, dejar mi trabajo.' },
      { id: 'objetivo_principal', label: '¿Cuál es tu principal objetivo dentro del programa?', type: 'textarea', help: 'Ej: llegar a USD 10.000/mes de facturación con margen.' },
      {
        id: 'objetivo_facturacion',
        label: '¿Cuánto querés estar facturando por mes en 6 meses?',
        type: 'dropdown',
        options: ['Hasta USD 5.000', 'USD 5.000 a 10.000', 'USD 10.000 a 30.000', 'USD 30.000 a 100.000', 'Más de USD 100.000'],
      },
      {
        id: 'horas_semana',
        label: '¿Cuántas horas REALES por semana le vas a dedicar?',
        type: 'dropdown',
        options: ['Menos de 5', '5 a 10', '10 a 20', '20 a 40', 'Full time (más de 40)'],
      },
      {
        id: 'capital',
        label: '¿Cuánto capital tenés disponible para invertir en producto y publicidad?',
        type: 'dropdown',
        options: ['Menos de USD 1.000', 'USD 1.000 a 3.000', 'USD 3.000 a 6.000', 'USD 6.000 a 15.000', 'Más de USD 15.000'],
      },
    ],
  },
  {
    id: 'contenido',
    title: 'Cómo nos conociste',
    questions: [
      { id: 'como_conociste', label: '¿Por dónde nos conociste?', type: 'dropdown', options: ['Instagram', 'TikTok', 'YouTube', 'Un anuncio', 'Recomendación de alguien', 'Otro'] },
      { id: 'donde_compraste', label: '¿Por dónde compraste?', type: 'dropdown', options: ['Después de una clase en vivo', 'Llamada con un closer', 'Por WhatsApp', 'Otro'] },
      { id: 'fuiste_clase', label: '¿Fuiste a alguna de las clases en vivo?', type: 'chips', options: ['Sí', 'No'] },
      { id: 'formato_favorito', label: '¿Qué formato del contenido de Manu te aporta o te gusta más?', type: 'dropdown', options: ['Reels', 'Historias', 'YouTube', 'Clases en vivo', 'Lives', 'No consumo mucho su contenido'] },
      { id: 'por_que_formato', label: '¿Por qué elegiste ese formato?', type: 'textarea', optional: true },
      {
        id: 'que_te_gusta',
        label: '¿Qué hace que te guste ese contenido?',
        type: 'multi',
        options: ['Es diferente a lo que todos hacen', 'Transmite confianza y autoridad', 'Muestra números y resultados reales', 'Es auténtico', 'Me cambia la perspectiva', 'Aporta valor que puedo aplicar'],
      },
      { id: 'contenido_mas', label: '¿Qué contenido te gustaría ver más?', type: 'textarea', optional: true },
    ],
  },
  {
    id: 'negocio',
    title: 'Tu punto de partida',
    subtitle: 'Lo básico de tu negocio hoy. De acá depende qué te preguntamos después.',
    today: true,
    questions: [
      { id: 'etapa', label: '¿En qué etapa está tu negocio hoy?', type: 'chips', options: STAGES },
      { id: 'marca', label: 'Nombre de tu marca o tienda', type: 'text', showIf: hasStore },
      { id: 'nicho', label: '¿En qué nicho o con qué producto trabajás (o querés trabajar)?', type: 'text', help: 'Si todavía no sabés, poné "no lo sé": para eso estamos.' },
      {
        id: 'modelo',
        label: '¿Qué modelo tenés o te interesa?',
        type: 'multi',
        options: ['Marca propia', 'Suscripción', 'Dropshipping', 'Importación y reventa', 'Producto fabricado por mí', 'Todavía no sé'],
      },
      {
        id: 'canales',
        label: '¿Dónde vendés hoy?',
        type: 'multi',
        showIf: hasStore,
        options: ['Shopify', 'Tiendanube', 'WooCommerce', 'Mercado Libre', 'Instagram / WhatsApp', 'Amazon', 'Local físico', 'Todavía en ningún lado'],
      },
      { id: 'tiempo_vendiendo', label: '¿Hace cuánto vendés online?', type: 'dropdown', showIf: isSelling, options: ['Menos de 3 meses', '3 a 12 meses', '1 a 3 años', 'Más de 3 años'] },
    ],
  },
  {
    id: 'recursos',
    title: 'Recursos',
    subtitle: 'Sin esto no podemos revisar tu negocio. Compartí con permiso de lectura: no hace falta pasarnos contraseñas.',
    today: true,
    showIf: hasStore,
    questions: [
      { id: 'link_tienda', label: 'Link de tu tienda o web', type: 'text', help: NO_LO_TENGO },
      { id: 'link_instagram', label: 'Instagram de la marca', type: 'text', help: NO_LO_TENGO },
      { id: 'link_tiktok', label: 'TikTok de la marca', type: 'text', help: NO_LO_TENGO },
      { id: 'link_meli', label: 'Link de tu cuenta de Mercado Libre', type: 'text', help: NO_LO_TENGO },
      {
        id: 'link_metricas',
        label: 'Link a tu planilla de métricas o reportes de ventas',
        type: 'text',
        help: 'Ideal: los últimos 6 meses con ventas, inversión en ads y margen por mes. ' + NO_LO_TENGO,
      },
    ],
  },
  {
    id: 'numeros',
    title: 'Los números de tu negocio',
    subtitle: 'Si algo no lo tenés o no lo sabés, poné "no lo tengo": un dato inventado nos hace tomar malas decisiones.',
    today: true,
    showIf: isSelling,
    questions: [
      { id: 'facturacion_3m', label: 'Facturación de los últimos 3 meses, mes a mes', type: 'textarea', help: 'Si tenés una planilla, pegá el link. Si no, armá la tablita: mes / facturado / pedidos.' },
      { id: 'ticket_promedio', label: 'Ticket promedio', type: 'text' },
      { id: 'margen', label: 'Costo del producto y margen bruto aproximado', type: 'text', help: 'Ej: me cuesta USD 8 puesto, lo vendo a USD 35, margen ~60% antes de ads.' },
      { id: 'pedidos_mes', label: '¿Cuántos pedidos hacés por mes?', type: 'text' },
      { id: 'ads_roas', label: 'Inversión en ads por mes y ROAS (últimos 3 meses)', type: 'textarea' },
      { id: 'cpa', label: 'Costo por compra (CPA) y tasa de conversión de la tienda', type: 'text' },
      { id: 'recompra', label: '¿Qué % de tus clientes vuelve a comprar?', type: 'text', help: 'Si tenés suscripción: cuántos suscriptores activos y churn mensual.' },
      { id: 'ganancia_neta', label: '¿Cuánto te queda de ganancia neta por mes?', type: 'text' },
    ],
  },
  {
    id: 'oferta',
    title: 'Tu producto y tu cliente',
    subtitle: 'De acá salen los ángulos, los creativos y la oferta.',
    showIf: hasStore,
    questions: [
      { id: 'productos', label: '¿Qué productos vendés? Precio, costo y cuál es el que más se vende', type: 'textarea' },
      { id: 'cliente_ideal', label: 'Tu cliente ideal: quién es, qué edad tiene, qué problema le resolvés y por qué te compra', type: 'textarea' },
      { id: 'diferencial', label: '¿Qué te hace distinto de la competencia?', type: 'textarea' },
      { id: 'oferta_actual', label: 'Tu oferta actual: promos, combos, envío gratis, garantía, cuotas', type: 'textarea' },
      { id: 'objeciones', label: '¿Qué dudas u objeciones te escriben más los clientes antes de comprar?', type: 'textarea' },
      { id: 'proveedores', label: '¿Cómo conseguís el producto? (proveedor local, importación, fabricación propia)', type: 'textarea' },
    ],
  },
  {
    id: 'mercado',
    title: 'Tu mercado',
    subtitle: 'Competencia directa y referentes.',
    questions: [
      {
        id: 'competidores',
        label: 'Tus 3 competidores directos (o marcas que venden algo parecido). Por cada uno: link + lo que sepas',
        type: 'textarea',
        help: 'Qué venden, a qué precio, qué hacen bien, qué hacen mal. Si todavía no tenés producto, contanos qué marcas mirás.',
      },
      { id: 'referentes', label: '3 marcas que admires (de acá o de afuera) y por qué', type: 'textarea', help: 'Link + qué te gusta de su marca, su contenido o sus anuncios.' },
    ],
  },
  {
    id: 'ads',
    title: 'Publicidad y marketing',
    subtitle: 'El camino completo desde que alguien te ve hasta que te compra.',
    showIf: hasStore,
    questions: [
      { id: 'corre_ads', label: '¿Corrés anuncios?', type: 'chips', options: ['Sí', 'No'] },
      { id: 'plataformas_ads', label: '¿En qué plataformas?', type: 'multi', showIf: yes('corre_ads'), options: ['Meta (Facebook / Instagram)', 'TikTok', 'Google', 'Mercado Ads', 'Influencers / UGC'] },
      { id: 'estrategia_ads', label: '¿Qué campañas corrés y cuál es la estrategia detrás?', type: 'textarea', showIf: yes('corre_ads'), help: 'Ej: 1 campaña de testeo con 3 creativos por ángulo y una de escala con los ganadores.' },
      { id: 'creativos_ganadores', label: 'Tus creativos ganadores: ¿cuál fue el anuncio que más plata trajo? ¿Sigue activo?', type: 'textarea', showIf: yes('corre_ads') },
      { id: 'pixel', label: '¿Tenés el píxel y la API de conversiones configurados?', type: 'chips', options: ['Sí', 'No', 'No sé'] },
      { id: 'bloqueos', label: '¿Tu cuenta publicitaria tuvo bloqueos, rechazos o bajas? ¿Tenés cuentas de respaldo?', type: 'textarea', showIf: yes('corre_ads') },
      { id: 'organico', label: '¿Cómo es tu contenido orgánico? Qué publicás, cada cuánto y quién lo hace', type: 'textarea', help: NO_LO_TENGO },
      { id: 'email_wpp', label: '¿Hacés email o WhatsApp marketing? (carrito abandonado, recompra, newsletters)', type: 'textarea', help: NO_LO_TENGO },
    ],
  },
  {
    id: 'operacion',
    title: 'Operación y equipo',
    subtitle: 'Todos los que te ayudan con el negocio, aunque sea part-time.',
    questions: [
      {
        id: 'logistica',
        label: '¿Cómo despachás los pedidos?',
        type: 'dropdown',
        showIf: hasStore,
        options: ['Los preparo y despacho yo', 'Correo / mensajería', 'Mercado Envíos / Full', 'Fulfillment tercerizado', 'Dropshipping (lo envía el proveedor)', 'Todavía no despacho'],
      },
      { id: 'herramientas', label: '¿Qué herramientas usás para organizarte? (Notion, planillas, Trello, WhatsApp)', type: 'text', help: NO_LO_TENGO },
      { id: 'contacto_operativo', label: '¿Quién va a ser nuestro contacto del día a día?', type: 'text', help: 'Si sos vos, poné "yo".' },
      { id: 'equipo', label: 'Tu equipo', type: 'people', optional: true, help: 'Si trabajás solo, dejalo vacío.' },
    ],
  },
  {
    id: 'historial',
    title: 'Tu historial',
    subtitle: 'Sin vergüenza: los "fracasos" nos ahorran meses.',
    questions: [
      {
        id: 'ya_probaste',
        label: 'Todo lo que YA probaste y qué pasó: productos que no funcionaron, agencias, cursos, canales que dejaste',
        type: 'textarea',
      },
      { id: 'mejor_mes', label: '¿Cuál fue tu MEJOR mes hasta ahora? ¿Qué estabas haciendo distinto? ¿Qué cambió desde entonces?', type: 'textarea', showIf: isSelling },
    ],
  },
  {
    id: 'compromiso',
    title: 'Expectativas',
    subtitle: 'Lo último. Gracias por el tiempo que le dedicaste a esto.',
    questions: [
      {
        id: 'valio_la_pena',
        label: '¿Qué tendría que pasar en los próximos 90 días para que digas "esto valió cada peso"?',
        type: 'textarea',
      },
      { id: 'compromiso', label: 'Del 1 al 10, ¿qué tan comprometido estás a ejecutar lo que vemos en el programa?', type: 'scale', min: 1, top: 10, minLabel: 'Poco', maxLabel: 'A full' },
      { id: 'contacto_preferido', label: '¿Cómo preferís que te contactemos?', type: 'chips', options: ['WhatsApp', 'Discord', 'Email'] },
      { id: 'algo_mas', label: '¿Hay algo más que tengamos que saber? (viajes, horarios, situación personal, lo que sea)', type: 'textarea', optional: true },
    ],
  },
];

// ---------- Helpers ----------

export const visibleSteps = (a: Answers) => STEPS.filter((s) => !s.showIf || s.showIf(a));
export const visibleQuestions = (s: OnbStep, a: Answers) => s.questions.filter((q) => !q.showIf || q.showIf(a));

export function isFilled(v: Answer | undefined): boolean {
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  return String(v).trim() !== '';
}

/** Mensaje de error del paso, o null si se puede avanzar. */
export function validateStep(s: OnbStep, a: Answers): string | null {
  for (const q of visibleQuestions(s, a)) {
    if (!q.optional && !isFilled(a[q.id])) return `Falta responder: «${q.label}»`;
  }
  return null;
}

/** Pasos completos de los visibles (para el panel). */
export function completedSteps(a: Answers) {
  const steps = visibleSteps(a);
  return { done: steps.filter((s) => !validateStep(s, a)).length, total: steps.length };
}

/** Texto de una respuesta para mostrar al equipo. */
export function answerText(v: Answer | undefined): string {
  if (!isFilled(v)) return '';
  if (Array.isArray(v)) {
    if (v.length && typeof v[0] === 'object') {
      return (v as Person[])
        .map((p) => [p.role, p.name].filter(Boolean).join(' · ') + (p.pay ? ` — cobra: ${p.pay}` : '') + (p.score ? ` — rendimiento ${p.score}/10` : '') + (p.why ? ` (${p.why})` : ''))
        .join('\n');
    }
    return (v as string[]).join(' · ');
  }
  return String(v);
}
