"use client";

import { useState } from "react";
import { Badge, EmptyState } from "@/components/ui/misc";
import { formatDateBR, toLocalParts } from "@/domain/time";
import type { CustomerReward } from "@/types";
import { useCustomer } from "./use-customer";

const STATUS = {
  available: { label: "Disponível", tone: "good" as const },
  used: { label: "Utilizado", tone: "neutral" as const },
  expired: { label: "Expirado", tone: "bad" as const },
  cancelled: { label: "Cancelado", tone: "neutral" as const },
};

function BenefitCard({ b }: { b: CustomerReward }) {
  const s = STATUS[b.status];
  return (
    <li className={`rounded-md border p-5 ${b.status === "available" ? "border-accent/40 bg-panel" : "border-edge bg-panel/60"}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="display text-xl">{b.rewardName}</p>
        <Badge tone={s.tone}>{s.label}</Badge>
      </div>
      <p className="mt-1 text-xs text-soft">
        Resgatado em {formatDateBR(toLocalParts(b.createdAt).date)}
        {b.expiresAt && ` · ${b.status === "expired" ? "expirou" : "válido"} até ${formatDateBR(toLocalParts(b.expiresAt).date)}`}
        {b.usedAt && ` · usado em ${formatDateBR(toLocalParts(b.usedAt).date)}`}
      </p>
      {b.status === "available" && (
        <div className="mt-4 rounded border border-dashed border-accent/50 bg-bg px-4 py-3 text-center">
          <p className="label-caps text-[11px] text-soft">Código de resgate</p>
          <p className="mt-1 font-mono text-xl tracking-widest text-accent-hi">{b.code}</p>
        </div>
      )}
    </li>
  );
}

export function BenefitsView() {
  const ctx = useCustomer();
  const [tab, setTab] = useState<"available" | "used" | "expired">("available");
  if (!ctx.customer) return null;
  const groups = {
    available: ctx.wallet.filter((b) => b.status === "available"),
    used: ctx.wallet.filter((b) => b.status === "used"),
    expired: ctx.wallet.filter((b) => b.status === "expired" || b.status === "cancelled"),
  };
  const labels = { available: "Disponíveis", used: "Utilizados", expired: "Expirados" } as const;
  const list = groups[tab];

  return (
    <div>
      <div role="tablist" aria-label="Filtrar benefícios" className="mb-5 flex flex-wrap gap-2">
        {(Object.keys(labels) as Array<keyof typeof labels>).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`label-caps rounded-full border px-4 py-2 text-xs transition-colors ${
              tab === k ? "border-accent bg-accent text-accent-fg" : "border-edge text-soft hover:text-fg"
            }`}
          >
            {labels[k]} <span className="opacity-70">({groups[k].length})</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState
          title={tab === "available" ? "Nenhum benefício disponível" : "Nada por aqui"}
          description={tab === "available" ? "Resgate uma recompensa em “Fidelidade” e ela aparece aqui, com o código para usar na barbearia." : undefined}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((b) => (
            <BenefitCard key={b.id} b={b} />
          ))}
        </ul>
      )}
    </div>
  );
}
