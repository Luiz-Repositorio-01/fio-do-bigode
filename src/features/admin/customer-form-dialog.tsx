"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { customerContactSchema, fieldErrors } from "@/schemas";
import { formatPhoneBR } from "@/domain/whatsapp";
import { api } from "@/lib/api";
import { updateCustomer } from "@/services/admin";
import type { Customer } from "@/types";
import { useRun } from "./use-run";

/** Cria (customer = null) ou edita um cliente. */
export function CustomerFormDialog(props: {
  open: boolean;
  customer: Customer | null;
  onClose: () => void;
  onSaved?: (customerId: string) => void;
}) {
  return props.open ? <CustomerFormBody {...props} /> : null;
}

function CustomerFormBody({
  open,
  customer,
  onClose,
  onSaved,
}: {
  open: boolean;
  customer: Customer | null;
  onClose: () => void;
  onSaved?: (customerId: string) => void;
}) {
  const { busy, run } = useRun();
  const [name, setName] = useState(customer?.name ?? "");
  const [whatsapp, setWhatsapp] = useState(customer ? formatPhoneBR(customer.whatsapp) : "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [birthDate, setBirthDate] = useState(customer?.birthDate ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit() {
    const parsed = customerContactSchema.safeParse({ name, whatsapp, email, birthDate });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    const data = parsed.data;
    const r = customer
      ? await run(
          () =>
            api.admin(
              (s) => updateCustomer(s, customer.id, { name: data.name, whatsapp: data.whatsapp, email: data.email, birthDate: data.birthDate }),
              customer.id,
            ),
          "Cliente atualizado.",
        )
      : await run(() => api.createCustomer({ name, whatsapp, email, birthDate }).then((c) => c.id), "Cliente cadastrado.");
    if (r.ok) {
      onSaved?.(r.value);
      onClose();
    } else if (r.fields) setErrors(r.fields);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={customer ? "Editar cliente" : "Novo cliente"}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={submit} loading={busy}>Salvar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="Nome" value={name} error={errors.name} onChange={(e) => setName(e.target.value)} />
        <TextField label="WhatsApp" type="tel" inputMode="tel" placeholder="(19) 99999-9999" value={whatsapp} error={errors.whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
        <TextField label="E-mail" type="email" optional value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Data de nascimento" type="date" optional value={birthDate} error={errors.birthDate} onChange={(e) => setBirthDate(e.target.value)} hint="Usada só para o bônus de aniversário e mensagens de parabéns." />
      </div>
    </Modal>
  );
}
