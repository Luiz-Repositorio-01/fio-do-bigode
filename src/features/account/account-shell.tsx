"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { IconLogout } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/misc";
import { formatPhoneBR } from "@/domain/whatsapp";
import { signOutCustomer } from "@/lib/store/session";
import { LoginForm } from "./login-form";
import { useCustomer } from "./use-customer";

const TABS = [
  { href: "/minha-conta", label: "Início" },
  { href: "/minha-conta/agendamentos", label: "Agendamentos" },
  { href: "/minha-conta/historico", label: "Histórico" },
  { href: "/minha-conta/fidelidade", label: "Fidelidade" },
  { href: "/minha-conta/beneficios", label: "Benefícios" },
  { href: "/minha-conta/perfil", label: "Meus dados" },
] as const;

export function AccountShell({ children }: { children: ReactNode }) {
  const ctx = useCustomer();
  const pathname = usePathname();

  if (!ctx.hydrated) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-5 py-14">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }
  if (!ctx.customer) {
    return (
      <div className="px-5 py-16 md:py-24">
        <LoginForm />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-10 md:py-14">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps text-xs text-accent-hi">Minha conta</p>
          <p className="display text-3xl md:text-4xl">Olá, {ctx.customer.name.split(" ")[0]}</p>
          <p className="text-sm text-soft">{formatPhoneBR(ctx.customer.whatsapp)}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={signOutCustomer}>
          <IconLogout width={16} height={16} /> Sair
        </Button>
      </div>

      <nav aria-label="Seções da conta" className="-mx-5 mb-8 overflow-x-auto border-b border-edge px-5">
        <ul className="flex min-w-max gap-1">
          {TABS.map((t) => {
            const current = pathname === t.href;
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={current ? "page" : undefined}
                  className={`label-caps relative inline-block px-4 py-3 text-[13px] transition-colors ${
                    current ? "text-accent-hi" : "text-soft hover:text-fg"
                  }`}
                >
                  {t.label}
                  {current && <span className="absolute inset-x-3 -bottom-px h-0.5 bg-accent" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {children}
    </div>
  );
}
