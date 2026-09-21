"use client";

import { useMemo } from "react";
import { customerMetrics, inSegment, segmentsFor, type CustomerMetrics, type CustomerSegments } from "@/domain/customers";
import { balanceOf, levelFor, lifetimePointsOf } from "@/domain/loyalty";
import { useNow } from "@/hooks/use-now";
import { useAppState } from "@/lib/store/store";
import type { Customer, CustomerSegmentKey, LoyaltyLevel } from "@/types";

export interface CustomerRow {
  customer: Customer;
  metrics: CustomerMetrics;
  segments: CustomerSegments;
  points: number;
  level: LoyaltyLevel | null;
}

/** Cliente + métricas + segmentos + pontos, calculados do estado atual. */
export function useCustomerRows(): CustomerRow[] {
  const state = useAppState();
  const now = useNow(60_000);
  return useMemo(
    () =>
      state.customers.map((customer) => {
        const metrics = customerMetrics(customer.id, state.appointments, now);
        return {
          customer,
          metrics,
          segments: segmentsFor({ customer, metrics, ledger: state.ledger, levels: state.levels, settings: state.settings, now }),
          points: balanceOf(state.ledger, customer.id),
          level: levelFor(lifetimePointsOf(state.ledger, customer.id), state.levels),
        };
      }),
    [state, now],
  );
}

export function rowsInSegment(rows: CustomerRow[], key: CustomerSegmentKey, lookahead: number): CustomerRow[] {
  return rows.filter((r) => inSegment(key, r.segments, lookahead));
}
