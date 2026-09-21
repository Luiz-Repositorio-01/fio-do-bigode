"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LinkButton } from "@/components/ui/button";
import { IconMenu, IconUser, IconX } from "@/components/ui/icons";
import { track } from "@/lib/analytics";
import { Logo } from "./logo";

export const NAV = [
  { href: "/servicos", label: "Serviços" },
  { href: "/barbeiros", label: "Barbeiros" },
  { href: "/fidelidade", label: "Fidelidade" },
  { href: "/galeria", label: "Galeria" },
  { href: "/sobre", label: "Sobre" },
  { href: "/contato", label: "Contato" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Fecha o menu móvel ao trocar de página (ajuste durante a renderização).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-edge bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between gap-4 px-5">
        <Logo />
        <nav aria-label="Principal" className="hidden items-center gap-7 lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={pathname === n.href ? "page" : undefined}
              className="label-caps text-[13px] text-soft transition-colors hover:text-fg aria-[current=page]:text-accent-hi"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/minha-conta"
            aria-label="Minha conta"
            className="hidden rounded p-2 text-soft hover:text-fg sm:inline-flex"
          >
            <IconUser />
          </Link>
          <LinkButton
            href="/agendar"
            size="sm"
            className="shrink-0 whitespace-nowrap"
            onClick={() => track("start_booking", { origin: "header" })}
          >
            <span className="sm:hidden">Agendar</span>
            <span className="hidden sm:inline">Agendar horário</span>
          </LinkButton>
          <button
            type="button"
            className="rounded p-2 text-fg lg:hidden"
            aria-label={open ? "Fechar menu" : "Abrir menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <IconX /> : <IconMenu />}
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-nav" className="fixed inset-x-0 top-[68px] bottom-0 z-40 overflow-y-auto bg-bg lg:hidden">
          <nav aria-label="Menu" className="mx-auto flex max-w-6xl flex-col px-5 py-6">
            {[...NAV, { href: "/minha-conta", label: "Minha conta" }].map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="display border-b border-edge py-4 text-2xl text-fg"
              >
                {n.label}
              </Link>
            ))}
            <LinkButton
              href="/agendar"
              size="lg"
              className="mt-8"
              onClick={() => track("start_booking", { origin: "menu" })}
            >
              Agendar horário
            </LinkButton>
          </nav>
        </div>
      )}
    </header>
  );
}
