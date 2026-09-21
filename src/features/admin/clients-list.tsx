"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconDownload, IconPlus } from "@/components/ui/icons";
import { SelectField, TextField } from "@/components/ui/form";
import { Badge, EmptyState } from "@/components/ui/misc";
import { SEGMENT_LABELS } from "@/domain/customers";
import { formatBRL } from "@/domain/pricing";
import { formatDateBR, toLocalParts } from "@/domain/time";
import { formatPhoneBR } from "@/domain/whatsapp";
import { useAppState } from "@/lib/store/store";
import type { CustomerSegmentKey } from "@/types";
import { CustomerFormDialog } from "./customer-form-dialog";
import { Card, PageTitle, TableWrap, TD, TH } from "./ui";
import { rowsInSegment, useCustomerRows, type CustomerRow } from "./use-crm";
import { useRouter } from "next/navigation";

type SortKey = "name" | "last" | "visits" | "spent" | "points";

const SORTS: Record<SortKey, { label: string; cmp: (a: CustomerRow, b: CustomerRow) => number }> = {
  name: { label: "Nome (A–Z)", cmp: (a, b) => a.customer.name.localeCompare(b.customer.name, "pt-BR") },
  last: { label: "Última visita (mais recente)", cmp: (a, b) => (b.metrics.lastVisitAt ?? "").localeCompare(a.metrics.lastVisitAt ?? "") },
  visits: { label: "Mais visitas", cmp: (a, b) => b.metrics.visits - a.metrics.visits },
  spent: { label: "Maior gasto", cmp: (a, b) => b.metrics.totalSpentCents - a.metrics.totalSpentCents },
  points: { label: "Mais pontos", cmp: (a, b) => b.points - a.points },
};

const SEGMENT_KEYS = Object.keys(SEGMENT_LABELS) as CustomerSegmentKey[];

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ClientsList() {
  const { settings } = useAppState();
  const router = useRouter();
  const rows = useCustomerRows();
  const [segment, setSegment] = useState<CustomerSegmentKey>("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [limit, setLimit] = useState(50);

  const counts = useMemo(
    () => Object.fromEntries(SEGMENT_KEYS.map((k) => [k, rowsInSegment(rows, k, settings.retention.birthdayLookaheadDays).length])) as Record<CustomerSegmentKey, number>,
    [rows, settings.retention.birthdayLookaheadDays],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return rowsInSegment(rows, segment, settings.retention.birthdayLookaheadDays)
      .filter(
        (r) =>
          !q ||
          r.customer.name.toLowerCase().includes(q) ||
          (digits.length >= 3 && r.customer.whatsapp.includes(digits)) ||
          (r.customer.email ?? "").toLowerCase().includes(q),
      )
      .sort(SORTS[sort].cmp);
  }, [rows, segment, query, sort, settings.retention.birthdayLookaheadDays]);

  function exportCsv() {
    const header = ["Nome", "WhatsApp", "E-mail", "Nascimento", "Visitas", "Última visita", "Total gasto (R$)", "Pontos"];
    const lines = filtered.map((r) =>
      [
        r.customer.name,
        r.customer.whatsapp,
        r.customer.email ?? "",
        r.customer.birthDate ?? "",
        r.metrics.visits,
        r.metrics.lastVisitAt ? toLocalParts(r.metrics.lastVisitAt).date : "",
        (r.metrics.totalSpentCents / 100).toFixed(2).replace(".", ","),
        r.points,
      ].map(csvCell).join(";"),
    );
    const blob = new Blob(["﻿" + [header.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "clientes.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageTitle
        title="Clientes"
        description="Cadastro, histórico e relacionamento. As observações internas nunca aparecem para o cliente."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
              <IconDownload width={16} height={16} /> Exportar CSV
            </Button>
            <Button onClick={() => setCreating(true)}>
              <IconPlus width={16} height={16} /> Novo cliente
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Segmentos">
        {SEGMENT_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={segment === k}
            onClick={() => setSegment(k)}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
              segment === k ? "border-accent bg-accent text-accent-fg" : "border-edge bg-panel text-soft hover:border-accent hover:text-fg"
            }`}
          >
            {SEGMENT_LABELS[k]} <span className="tabular-nums opacity-80">({counts[k]})</span>
          </button>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_16rem]">
        <TextField label="Buscar" placeholder="Nome, WhatsApp ou e-mail" value={query} onChange={(e) => setQuery(e.target.value)} />
        <SelectField label="Ordenar por" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          {(Object.keys(SORTS) as SortKey[]).map((k) => (
            <option key={k} value={k}>{SORTS[k].label}</option>
          ))}
        </SelectField>
      </div>

      <Card flush>
        {filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={rows.length === 0 ? "Nenhum cliente ainda" : "Nenhum cliente neste filtro"}
              description={
                rows.length === 0
                  ? "Clientes aparecem aqui quando agendam pelo site ou quando você os cadastra."
                  : "Troque o segmento ou a busca."
              }
            />
          </div>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <TH>Cliente</TH>
                <TH className="text-right">Visitas</TH>
                <TH>Última visita</TH>
                <TH className="text-right">Total gasto</TH>
                <TH className="text-right">Pontos</TH>
                <TH>Situação</TH>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((r) => (
                <tr
                  key={r.customer.id}
                  className="cursor-pointer hover:bg-panel-2/50"
                  onClick={() => router.push(`/admin/clientes/${r.customer.id}`)}
                >
                  <TD>
                    <Link
                      href={`/admin/clientes/${r.customer.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-accent-hi underline underline-offset-4"
                    >
                      {r.customer.name}
                    </Link>
                    <span className="block text-xs text-soft">{formatPhoneBR(r.customer.whatsapp)}</span>
                  </TD>
                  <TD className="text-right tabular-nums">{r.metrics.visits}</TD>
                  <TD className="whitespace-nowrap tabular-nums">
                    {r.metrics.lastVisitAt ? formatDateBR(toLocalParts(r.metrics.lastVisitAt).date) : "—"}
                  </TD>
                  <TD className="text-right tabular-nums">{r.metrics.visits ? formatBRL(r.metrics.totalSpentCents) : "—"}</TD>
                  <TD className="text-right tabular-nums">
                    {r.points}
                    {r.level && <span className="block text-xs text-soft">{r.level.name}</span>}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {r.segments.isNew && <Badge tone="accent">Novo</Badge>}
                      {r.segments.isVip && <Badge tone="accent">VIP</Badge>}
                      {r.segments.isRecurring && <Badge tone="good">Recorrente</Badge>}
                      {r.segments.isInactive && <Badge tone="warn">Inativo {r.segments.inactiveBucket}+ d</Badge>}
                      {r.segments.birthdayInDays !== null && r.segments.birthdayInDays <= settings.retention.birthdayLookaheadDays && (
                        <Badge tone="neutral">Aniversário</Badge>
                      )}
                    </div>
                  </TD>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        {filtered.length > limit && (
          <div className="border-t border-edge p-3 text-center">
            <Button variant="ghost" size="sm" onClick={() => setLimit(limit + 50)}>
              Mostrar mais ({filtered.length - limit})
            </Button>
          </div>
        )}
      </Card>
      <p className="mt-2 text-xs text-soft">{filtered.length} cliente(s)</p>

      <CustomerFormDialog open={creating} customer={null} onClose={() => setCreating(false)} onSaved={(id) => router.push(`/admin/clientes/${id}`)} />
    </>
  );
}
