"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { IconLogout } from "@/components/ui/icons";
import { Notice, Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { signInAdmin, signOutAdmin, useSession } from "@/lib/store/session";
import { useAppState, useHydrated } from "@/lib/store/store";

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/agenda", label: "Agenda" },
  { href: "/admin/agendamentos", label: "Agendamentos" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/servicos", label: "Serviços" },
  { href: "/admin/barbeiros", label: "Barbeiros" },
  { href: "/admin/fidelidade", label: "Fidelidade" },
  { href: "/admin/recompensas", label: "Recompensas" },
  { href: "/admin/campanhas", label: "Campanhas" },
  { href: "/admin/configuracoes", label: "Configurações" },
] as const;

function AdminLogin() {
  const state = useAppState();
  const [busy, setBusy] = useState(false);

  // Demonstração: se o navegador ainda está vazio, já entra com dados fictícios (marcados como "Demo")
  // para o painel não abrir zerado. Se já houver dados, nada é alterado.
  async function enter() {
    setBusy(true);
    try {
      if (state.customers.length === 0 && state.appointments.length === 0) await api.loadDemoData();
    } finally {
      signInAdmin();
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-16">
      <p className="label-caps text-xs text-accent-hi">Painel administrativo</p>
      <h1 className="display mt-1 text-4xl">Fio do Bigode</h1>
      <p className="mt-2 text-soft">Agenda, clientes, fidelidade e mensagens em um só lugar.</p>
      <div className="mt-8 space-y-4">
        <Button size="lg" className="w-full" loading={busy} onClick={enter}>
          Entrar no painel de demonstração
        </Button>
        <Notice tone="warn" title="Acesso de demonstração">
          Nesta versão qualquer pessoa com o link entra, e os dados ficam só neste navegador. No produto final o painel
          exige e-mail e senha (Supabase Auth), com permissão de administrador verificada no servidor.
        </Notice>
        <p className="text-center text-sm text-soft">
          <Link href="/" className="text-accent-hi underline underline-offset-4">Voltar ao site</Link>
        </p>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const session = useSession();
  const pathname = usePathname();
  const { business } = useAppState();

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-5 py-10">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!session.admin) return <AdminLogin />;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="border-b border-edge bg-panel lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 px-5 py-4 lg:block">
          <div>
            <p className="display text-xl leading-none">{business.name}</p>
            <p className="label-caps mt-1 text-[11px] text-soft">Painel · demonstração</p>
          </div>
          <div className="flex gap-1 lg:mt-4">
            <Link href="/" className="label-caps rounded px-2.5 py-2 text-xs text-soft hover:bg-panel-2 hover:text-fg">Ver site</Link>
            <button
              type="button"
              onClick={signOutAdmin}
              className="label-caps inline-flex items-center gap-1.5 rounded px-2.5 py-2 text-xs text-soft hover:bg-panel-2 hover:text-fg"
            >
              <IconLogout width={14} height={14} /> Sair
            </button>
          </div>
        </div>
        <nav aria-label="Painel" className="overflow-x-auto px-3 pb-3 lg:pb-6">
          <ul className="flex gap-1 lg:flex-col">
            {NAV.map((n) => {
              const current = pathname === n.href || pathname.startsWith(`${n.href}/`);
              return (
                <li key={n.href} className="shrink-0">
                  <Link
                    href={n.href}
                    aria-current={current ? "page" : undefined}
                    className={`block rounded px-3 py-2 text-[15px] transition-colors ${
                      current ? "bg-accent font-semibold text-accent-fg" : "text-soft hover:bg-panel-2 hover:text-fg"
                    }`}
                  >
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
      <main id="conteudo" className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
