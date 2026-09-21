"use client";

import { useMemo } from "react";
import { customerMetrics } from "@/domain/customers";
import { useNow } from "@/hooks/use-now";
import { useSession } from "@/lib/store/session";
import { useAppState, useHydrated } from "@/lib/store/store";
import { loyaltySummary } from "@/services/loyalty";

/** Cliente logado (demo) + métricas e resumo de fidelidade. */
export function useCustomer() {
  const state = useAppState();
  const hydrated = useHydrated();
  const session = useSession();
  const now = useNow(60_000);

  return useMemo(() => {
    const customer = session.customerId
      ? (state.customers.find((c) => c.id === session.customerId) ?? null)
      : null;
    if (!customer) return { hydrated, customer: null as null, state };
    return {
      hydrated,
      state,
      customer,
      now,
      metrics: customerMetrics(customer.id, state.appointments, now),
      loyalty: loyaltySummary(state, customer.id),
      appointments: state.appointments
        .filter((a) => a.customerId === customer.id)
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
      wallet: state.customerRewards
        .filter((r) => r.customerId === customer.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      ledger: state.ledger
        .filter((t) => t.customerId === customer.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  }, [state, hydrated, session.customerId, now]);
}

export type CustomerContext = NonNullable<Extract<ReturnType<typeof useCustomer>, { customer: NonNullable<unknown> }>>;
