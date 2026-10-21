export type Role = 'member' | 'superadmin';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  active: boolean;
  last_seen_at: string | null;
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

export interface Form {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  call_type: CallType;
  questions: Question[];
  is_active: boolean;
  created_at: string;
}

export interface FormResponse {
  id: string;
  form_id: string;
  user_id: string | null;
  respondent_name: string;
  respondent_email: string;
  call_date: string | null;
  answers: Record<string, string | number>;
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
  currency: string;
  installments_count: number;
  notes: string | null;
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
  created_at: string;
}
