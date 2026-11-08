export type Role = 'member' | 'superadmin';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  active: boolean;
  last_seen_at: string | null;
  must_change_password: boolean;
  temp_password_expires_at: string | null;
  created_at: string;
}

export interface LessonProgressRow {
  user_id: string;
  module_id: string;
  lesson_id: string;
  completed: boolean;
  completed_at: string | null;
  last_watched_at: string | null;
}

export type QuestionType = 'text' | 'textarea' | 'select' | 'scale';

export interface Question {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  help?: string;
  options?: string[];
  min?: number;
  max?: number;
}

export type CallType = '1:1' | 'grupal';

export type FormKind = 'custom' | 'pre_clase';

export interface FormSettings {
  bullets_title?: string;
  bullets?: string[];
  callout?: string;
  callout_highlight?: string;
  /** Solo pre_clase: ayuda y ejemplo que se muestran en cada pregunta. */
  question_help?: string;
  question_example?: string;
}

export interface Form {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  call_type: CallType;
  kind: FormKind;
  settings: FormSettings;
  questions: Question[];
  is_active: boolean;
  created_at: string;
}

export interface ClassSlot {
  id: string;
  kind: CallType;
  weekday: number | null;
  start_time: string | null;
  coach: string;
  programs: string[];
  active: boolean;
  created_at: string;
}

export interface FormResponse {
  id: string;
  form_id: string;
  user_id: string | null;
  respondent_name: string;
  respondent_email: string;
  discord_channel: string | null;
  call_date: string | null;
  answers: Record<string, string | number | string[]>;
  program: string | null;
  coach: string | null;
  call_kind: CallType | null;
  slot_label: string | null;
  reviewed: boolean;
  admin_notes: string | null;
  submitted_at: string;
}

export type ClientStatus = 'activo' | 'pausado' | 'finalizado' | 'baja';

export interface Client {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  program: string | null;
  status: ClientStatus;
  start_date: string | null;
  end_date: string | null;
  total_amount: number;
  /** Parte del contrato que corresponde a upsells. */
  upsell_amount: number;
  currency: string;
  installments_count: number;
  notes: string | null;
  discord_channel: string | null;
  profile_id: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  client_id: string;
  installment_number: number | null;
  amount: number;
  currency: string;
  due_date: string | null;
  paid_at: string | null;
  method: string | null;
  notes: string | null;
  sales_call_id: string | null;
  receipt_path: string | null;
  /** Cuota de la venta original o de un upsell. */
  kind: 'venta' | 'upsell';
  created_at: string;
}

// ---------- Leads de la landing ----------

export interface Launch {
  id: string;
  name: string;
  starts_at: string | null;
  is_current: boolean;
  cash_goal: number | null;
  daily_cash_goal: number | null;
  sales_close_at: string | null;
  created_at: string;
}

export type RepStatus = 'activo' | 'pausado' | 'baja';

export interface SalesRep {
  id: string;
  name: string;
  whatsapp_url: string;
  profile_id: string | null;
  /** null = no tiene el rol. */
  sdr_status: RepStatus | null;
  closer_status: RepStatus | null;
  sdr_weight: number;
  created_at: string;
}

export interface CrmSettings {
  id: boolean;
  default_whatsapp_url: string;
  assignment_mode: 'bolsa' | 'ronda';
  sdr_commission_pct: number;
  closer_commission_pct: number;
  updated_at: string;
}

export interface CrmAgent {
  id: string;
  name: string;
  description: string;
  message: string;
  sort: number;
  active: boolean;
  created_at: string;
}

export interface CrmResource {
  id: string;
  title: string;
  kind: 'link' | 'guion';
  url: string | null;
  body: string | null;
  audience: 'todos' | 'sdr' | 'closer';
  sort: number;
  active: boolean;
  created_at: string;
  /** Dueño del recurso personal (SDR o closer). null = compartido del admin. */
  owner_id: string | null;
}

export interface Commission {
  rep_id: string;
  role: 'sdr' | 'closer';
  sales: number;
  cash: number;
  earned: number;
  pending: number;
}

export interface LaunchProgress {
  cash: number;
  cash_today: number;
  sales: number;
  sales_today: number;
}

export interface Lead {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string;
  sdr_id: string | null;
  possible_duplicate: boolean;
  created_at: string;
  updated_at: string;
}

export type Cadence = 'intensa' | 'normal' | 'espaciada' | 'ninguna';

export type PostClassStatus = 'Nuevo lead' | 'No atendió' | 'Agendado' | 'No se cerró' | 'Cliente · falta onboarding' | 'Cliente';

export interface LeadLaunch {
  id: string;
  lead_id: string;
  launch_id: string;
  optin_at: string | null;
  optin_count: number;
  inversion_meta: string | null;
  califica: boolean | null;
  variant: string | null;
  tracking: Record<string, string>;
  source: string | null;
  stage: string;
  contact_attempts: number;
  toco_grupo: boolean;
  toco_grupo_at: string | null;
  applied_at: string | null;
  application: Record<string, unknown> | null;
  application_tracking: Record<string, string> | null;
  route: 'aplicado' | 'rechazado' | null;
  post_class_status: PostClassStatus | null;
  closer_id: string | null;
  next_action: string | null;
  next_action_at: string | null;
  answered: boolean | null;
  real_conversation: boolean | null;
  sdr_qualified: boolean | null;
  readiness: 'listo' | 'nutricion' | null;
  agendo: boolean | null;
  followup_cadence: Cadence | null;
  followup_started_at: string | null;
  followup_step: number;
  next_followup_at: string | null;
  finalized_reason: string | null;
  finalized_at: string | null;
  finalized_by_name: string | null;
  no_cuenta_reason: string | null;
  sdr_notes: string | null;
  asked_agents: boolean;
  agents_sent: { agents: string[]; channel: string; at: string; by: string }[];
  created_at: string;
  updated_at: string;
}

export interface LandingVisit {
  launch_id: string;
  day: string;
  source: string;
  variant: string;
  visits: number;
}

export interface LeadEvent {
  id: string;
  lead_id: string;
  launch_id: string | null;
  kind: string;
  summary: string;
  data: Record<string, unknown>;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

export type CallStatus = 'agendada' | 'realizada' | 'cancelada';

export interface SalesCall {
  id: string;
  lead_launch_id: string;
  closer_id: string | null;
  scheduled_at: string;
  scheduled_by: string | null;
  scheduled_by_name: string | null;
  sdr_note: string | null;
  status: CallStatus;
  result: 'no_cerro' | 'cerro' | 'seguimiento' | null;
  sdr_id: string | null;
  attendance: 'se_presento' | 'no_show' | 'cancelo' | null;
  closer_followup_at: string | null;
  program: string | null;
  result_note: string | null;
  amount_total: number | null;
  amount_collected: number | null;
  currency: string;
  payment_method: string | null;
  receipt_path: string | null;
  client_id: string | null;
  payment_id: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}
