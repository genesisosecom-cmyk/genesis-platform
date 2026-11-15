import { supabase, unwrap } from '../lib/supabase';
import type { Answers } from './questions';

export interface OnboardingRow {
  user_id: string;
  answers: Answers;
  step: number;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  reviewed: boolean;
  admin_notes: string | null;
}

export interface OnboardingContext {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  program: string | null;
}

export const fetchMyOnboarding = async (userId: string) =>
  unwrap(await supabase.from('onboarding_responses').select('*').eq('user_id', userId).maybeSingle()) as OnboardingRow | null;

export const fetchMyContext = async () => unwrap(await supabase.rpc('my_onboarding_context')) as OnboardingContext | null;

export const saveOnboarding = async (answers: Answers, step: number, complete = false) =>
  unwrap(await supabase.rpc('save_onboarding', { p_answers: answers, p_step: step, p_complete: complete })) as OnboardingRow;

// ---------- Admin ----------

export const fetchOnboardings = async () =>
  unwrap(await supabase.from('onboarding_responses').select('*').order('updated_at', { ascending: false })) as OnboardingRow[];

export const fetchOnboarding = async (userId: string) =>
  unwrap(await supabase.from('onboarding_responses').select('*').eq('user_id', userId).maybeSingle()) as OnboardingRow | null;

export async function updateOnboarding(userId: string, patch: Partial<Pick<OnboardingRow, 'reviewed' | 'admin_notes'>>) {
  unwrap(await supabase.from('onboarding_responses').update(patch).eq('user_id', userId));
}

export async function setClientOnboarded(clientId: string, done: boolean) {
  unwrap(await supabase.rpc('client_set_onboarded', { p_client: clientId, p_done: done }));
}

/** Estado del formulario para mostrar en listas. */
export function onboardingState(row: OnboardingRow | null | undefined): 'sin_empezar' | 'en_curso' | 'completo' {
  if (!row) return 'sin_empezar';
  return row.completed_at ? 'completo' : 'en_curso';
}
