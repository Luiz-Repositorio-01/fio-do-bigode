/**
 * Camada de "servidor" da DEMONSTRAÇÃO.
 *
 * Cada função é assíncrona (com latência simulada) e chama os serviços de
 * domínio sobre o armazenamento local. Ao aprovar o produto, é AQUI que entram
 * as Server Actions / RPCs do Supabase — a UI não muda, pois já lida com
 * loading, erro e sucesso.
 */
import type { BookingInput } from "@/schemas";
import { commit } from "@/lib/store/store";
import {
  cancelAppointment,
  completeAppointment,
  confirmAppointment,
  createBooking,
  markNoShow,
  rescheduleAppointment,
} from "@/services/booking";
import {
  adjustPoints,
  grantBirthdayBonuses,
  markRewardUsed,
  redeemReward,
  runExpiration,
} from "@/services/loyalty";
import { clearDemoData, loadDemoData } from "@/services/demo-data";
import { createCustomer } from "@/services/admin";
import type { CustomerContactInput } from "@/schemas";
import type { DataState } from "@/types";

const wait = (ms = 350) => new Promise<void>((r) => setTimeout(r, ms));
const now = () => Date.now();

type Actor =
  | { kind: "admin" }
  | { kind: "customer"; customerId?: string; token?: string };

export const api = {
  async createBooking(input: BookingInput, opts?: { source?: "site" | "admin" }) {
    await wait(500);
    return commit((s) => {
      const r = createBooking(s, input, now(), opts);
      return { state: r.state, result: r };
    });
  },

  async cancelAppointment(appointmentId: string, actor: Actor, reason?: string) {
    await wait();
    return commit((s) => ({
      state: cancelAppointment(s, { appointmentId, actor, reason }, now()),
      result: true as const,
    }));
  },

  async rescheduleAppointment(args: {
    appointmentId: string;
    newStartsAt: string;
    newProfessionalId?: string;
    actor: Actor;
  }) {
    await wait();
    return commit((s) => {
      const r = rescheduleAppointment(s, args, now());
      return { state: r.state, result: r.appointment };
    });
  },

  async confirmAppointment(appointmentId: string) {
    await wait(200);
    return commit((s) => ({ state: confirmAppointment(s, appointmentId, now()), result: true as const }));
  },

  async markNoShow(appointmentId: string) {
    await wait(200);
    return commit((s) => ({ state: markNoShow(s, appointmentId, now()), result: true as const }));
  },

  async completeAppointment(appointmentId: string, finalPriceCents: number | null) {
    await wait(300);
    return commit((s) => {
      const r = completeAppointment(s, { appointmentId, finalPriceCents }, now());
      return { state: r.state, result: r };
    });
  },

  async redeemReward(customerId: string, rewardId: string) {
    await wait(400);
    return commit((s) => {
      const r = redeemReward(s, { customerId, rewardId }, now());
      return { state: r.state, result: r.customerReward };
    });
  },

  async useReward(customerRewardId: string) {
    await wait(200);
    return commit((s) => ({ state: markRewardUsed(s, customerRewardId, now()), result: true as const }));
  },

  async adjustPoints(customerId: string, amount: number, reason: string) {
    await wait(250);
    return commit((s) => ({ state: adjustPoints(s, { customerId, amount, reason }, now()), result: true as const }));
  },

  async createCustomer(input: CustomerContactInput) {
    await wait(250);
    return commit((s) => {
      const r = createCustomer(s, input, now());
      return { state: r.state, result: r.customer };
    });
  },

  async runMaintenance() {
    await wait(300);
    return commit((s) => {
      const exp = runExpiration(s, now());
      const bday = grantBirthdayBonuses(exp.state, now());
      return {
        state: bday.state,
        result: {
          expiredPoints: exp.expiredPoints,
          expiredRewards: exp.expiredRewards,
          birthdayBonuses: bday.granted,
        },
      };
    });
  },

  async loadDemoData() {
    await wait(600);
    return commit((s) => ({ state: loadDemoData(s, now()), result: true as const }));
  },

  async clearDemoData() {
    await wait(300);
    return commit((s) => ({ state: clearDemoData(s), result: true as const }));
  },

  /** Mutação genérica para telas de cadastro do admin (CRUD). */
  async admin<T = true>(fn: (s: DataState, now: number) => DataState, result?: T, delay = 250) {
    await wait(delay);
    return commit((s) => ({ state: fn(s, now()), result: (result ?? true) as T }));
  },
};

export type Api = typeof api;
