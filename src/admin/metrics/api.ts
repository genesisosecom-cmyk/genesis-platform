import { supabase, unwrap } from '../../lib/supabase';

export type Num = number | null;
export type Summary = Record<
  | 'optins' | 'optins_pauta' | 'optins_sin_anuncio' | 'calificados' | 'calificados_pauta' | 'pct_calificados_pauta'
  | 'visitas' | 'visitas_pauta' | 'conversion_landing' | 'calificados_por_visita' | 'grupo' | 'pct_grupo' | 'grupo_pauta'
  | 'pct_grupo_pauta' | 'contactados' | 'tasa_contacto' | 'contestaron' | 'pickup' | 'pct_contestaron' | 'calificaron_sdr'
  | 'calificacion_real' | 'agendaron' | 'tasa_agenda',
  Num
>;

export interface VersionRow {
  version: string;
  visitantes: number;
  optins: number;
  optins_por_visitante: Num;
  calificados: number;
  pct_calificados: Num;
  calificados_por_visitante: Num;
  grupo: number;
  pct_grupo: Num;
  serie: { dia: string; visitantes: number; optins: number; calificados: number }[];
}

export interface Cuotas {
  cuotas: number;
  monto: number;
  detalle: { nombre: string | null; programa: string | null; monto: number; vence: string }[];
}

export interface AdsMetrics {
  launch: string;
  desde: string;
  hasta: string;
  hoy: string;
  generado: string;
  no_cuentan: number;
  resumen: Summary;
  por_dia: (Summary & { dia: string })[];
  versiones: VersionRow[];
  ganador: { version: string; contra: string; z: Num; confianza: Num } | null;
  fuentes: { fuente: string; visitas: number; optins: number; calificados: number; grupo: number }[];
  respuestas_pauta: {
    inversion: { opcion: string; leads: number; califican: number }[];
    paises: { pais: string; leads: number; califican: number }[];
  };
  embudo: {
    pasos: Record<'optins' | 'contactados' | 'contestaron' | 'calificaron_sdr' | 'agendaron' | 'se_presentaron' | 'ventas', number>;
    estados: { estado: string; leads: number }[];
    stages: { stage: string; leads: number }[];
    intentos: { intentos: string; leads: number }[];
  };
  ventas: {
    por_programa: { programa: string; ventas: number; vendido: number; cobrado: number }[];
    vencidas: Cuotas;
    proximas_7_dias: Cuotas;
  };
}

export const fetchAdsMetrics = async (launch: string, from: string | null, to: string | null) =>
  unwrap(await supabase.rpc('crm_ads_metrics', { p_launch: launch, p_from: from, p_to: to })) as AdsMetrics;
