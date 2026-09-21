"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { todayLocal } from "@/domain/time";
import { formatPhoneBR } from "@/domain/whatsapp";
import { api } from "@/lib/api";
import { updateCustomer } from "@/services/admin";
import { DomainError } from "@/services/errors";
import { customerContactSchema, fieldErrors } from "@/schemas";
import { ReferralCard } from "./referral-card";
import { useCustomer } from "./use-customer";

export function ProfileForm() {
  const ctx = useCustomer();
  if (!ctx.customer) return null;
  // key: ao trocar de cliente o formulário recomeça com os dados dele.
  return <ProfileFormBody key={ctx.customer.id} />;
}

function ProfileFormBody() {
  const ctx = useCustomer();
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    name: ctx.customer?.name ?? "",
    whatsapp: ctx.customer ? formatPhoneBR(ctx.customer.whatsapp) : "",
    email: ctx.customer?.email ?? "",
    birthDate: ctx.customer?.birthDate ?? "",
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (!ctx.customer) return null;
  const customer = ctx.customer;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = customerContactSchema.safeParse(form);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    try {
      await api.admin((s) => updateCustomer(s, customer.id, parsed.data));
      toast("Dados atualizados.");
    } catch (err) {
      if (err instanceof DomainError && err.fields) setErrors(err.fields);
      else toast(err instanceof DomainError ? err.message : "Não foi possível salvar.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={save} noValidate className="grid max-w-xl gap-4">
        <TextField label="Nome" autoComplete="name" value={form.name} error={errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <TextField label="WhatsApp" type="tel" autoComplete="tel" value={form.whatsapp} error={errors.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
        <TextField label="E-mail" type="email" optional autoComplete="email" value={form.email} error={errors.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <TextField label="Data de nascimento" type="date" optional max={todayLocal()} value={form.birthDate} error={errors.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
        <div><Button type="submit" loading={busy}>Salvar alterações</Button></div>
      </form>
      <ReferralCard customer={customer} />
      <Notice title="Seus dados">
        Para pedir correção ou exclusão dos seus dados (LGPD), fale com a barbearia pelo WhatsApp.
      </Notice>
    </div>
  );
}
