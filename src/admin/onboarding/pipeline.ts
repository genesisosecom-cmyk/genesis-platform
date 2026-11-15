import type { Client, Profile } from '../../lib/types';
import { onboardingState, type OnboardingRow } from '../../onboarding/api';
import { completedSteps } from '../../onboarding/questions';

/** Los pasos del onboarding de un cliente nuevo, en orden. */
export const ONB_STEPS = ['venta', 'acceso', 'ingreso', 'formulario', 'kickoff'] as const;
export type OnbStepKey = (typeof ONB_STEPS)[number];

export const ONB_STEP_LABELS: Record<OnbStepKey, string> = {
  venta: 'Venta cerrada',
  acceso: 'Acceso al campus',
  ingreso: 'Primer ingreso',
  formulario: 'Formulario de onboarding',
  kickoff: 'Kickoff / onboarding hecho',
};

export interface ClientOnboarding {
  done: Record<OnbStepKey, boolean>;
  /** Primer paso que falta (null = onboarding completo). */
  pending: OnbStepKey | null;
  form: ReturnType<typeof onboardingState>;
  formSteps: { done: number; total: number } | null;
}

export function clientOnboarding(client: Client, profile: Profile | null | undefined, row: OnboardingRow | null | undefined): ClientOnboarding {
  const done: Record<OnbStepKey, boolean> = {
    venta: true,
    acceso: Boolean(profile),
    ingreso: Boolean(profile && profile.last_seen_at && !profile.must_change_password),
    formulario: Boolean(row?.completed_at),
    kickoff: Boolean(client.onboarded_at),
  };
  return {
    done,
    pending: ONB_STEPS.find((k) => !done[k]) ?? null,
    form: onboardingState(row),
    formSteps: row ? completedSteps(row.answers) : null,
  };
}

/** Qué tiene que hacer el equipo ahora con ese cliente. */
export const NEXT_ACTION: Record<OnbStepKey, string> = {
  venta: 'Registrar la venta',
  acceso: 'Darle acceso al campus',
  ingreso: 'Esperando su primer ingreso',
  formulario: 'Esperando el formulario',
  kickoff: 'Leer formulario y hacer el kickoff',
};

/** Usuario del campus vinculado al cliente (el vínculo por email lo hace la base sola). */
export const profileForClient = (client: Client, profiles: Profile[]) => profiles.find((p) => p.id === client.profile_id);
