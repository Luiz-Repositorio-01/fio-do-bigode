"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { normalizeWhatsApp } from "@/domain/whatsapp";
import { signInCustomer } from "@/lib/store/session";
import { useAppState } from "@/lib/store/store";

/**
 * Login de DEMONSTRAÇÃO: identifica o cliente só pelo WhatsApp.
 * Em produção: código de uso único (OTP) por e-mail via Supabase Auth
 * e, com provedor contratado, por WhatsApp.
 */
export function LoginForm() {
  const { customers } = useAppState();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = normalizeWhatsApp(value);
    if (!n) return setError("WhatsApp inválido. Use DDD + número.");
    const c = customers.find((x) => x.whatsapp === n);
    if (!c) return setError("Não encontramos um cadastro com esse WhatsApp. Faça um agendamento para se cadastrar.");
    signInCustomer(c.id);
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="display text-4xl">Minha conta</h1>
      <p className="mt-2 text-soft">Acompanhe seus horários, histórico e pontos de fidelidade.</p>
      <form onSubmit={submit} noValidate className="mt-8 space-y-4">
        <TextField
          label="Seu WhatsApp"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(19) 99999-9999"
          value={value}
          error={error ?? undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
        />
        <Button type="submit" size="lg" className="w-full">Entrar</Button>
      </form>
      <div className="mt-6 space-y-3">
        <Notice tone="warn" title="Acesso de demonstração">
          Nesta versão o acesso é só pelo WhatsApp, sem verificação. No produto final, você recebe um código de
          confirmação.
        </Notice>
        <p className="text-center text-sm text-soft">
          Ainda não tem cadastro?{" "}
          <Link href="/agendar" className="text-accent-hi underline underline-offset-4">
            Agende um horário
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
