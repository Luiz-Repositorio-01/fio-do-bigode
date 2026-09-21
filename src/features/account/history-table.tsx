"use client";

import { EmptyState } from "@/components/ui/misc";
import { formatPrice } from "@/domain/pricing";
import { formatDateBR, minutesToHHmm, toLocalParts } from "@/domain/time";
import { StatusBadge } from "@/features/booking/status";
import { useAppState } from "@/lib/store/store";
import { useCustomer } from "./use-customer";

export function HistoryTable() {
  const ctx = useCustomer();
  const { professionals } = useAppState();
  if (!ctx.customer) return null;
  const past = ctx.appointments.filter(
    (a) => a.status === "completed" || a.status === "cancelled" || a.status === "no_show",
  );
  if (past.length === 0) {
    return <EmptyState title="Seu histórico aparece aqui" description="Depois do primeiro atendimento, você acompanha tudo por aqui." />;
  }
  return (
    <div className="overflow-x-auto rounded-md border border-edge">
      <table className="w-full min-w-[560px] text-left text-[15px]">
        <caption className="sr-only">Histórico de atendimentos</caption>
        <thead className="label-caps bg-panel text-xs text-soft">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">Data</th>
            <th scope="col" className="px-4 py-3 font-semibold">Serviço</th>
            <th scope="col" className="px-4 py-3 font-semibold">Profissional</th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">Valor</th>
            <th scope="col" className="px-4 py-3 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {past.map((a) => {
            const l = toLocalParts(a.startsAt);
            return (
              <tr key={a.id} className="border-t border-edge">
                <td className="px-4 py-3 tabular-nums">{formatDateBR(l.date)} <span className="text-soft">{minutesToHHmm(l.minutes)}</span></td>
                <td className="px-4 py-3">{a.serviceName}</td>
                <td className="px-4 py-3 text-soft">{professionals.find((p) => p.id === a.professionalId)?.name ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {a.status === "completed" ? formatPrice(a.finalPriceCents ?? a.priceCents, false) : "—"}
                </td>
                <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
