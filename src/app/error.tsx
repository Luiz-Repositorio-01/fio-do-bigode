"use client";

import { buttonClasses } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="conteudo" className="flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <p className="label-caps text-sm text-accent-hi">Algo deu errado</p>
      <h1 className="display mt-3 text-4xl">Não conseguimos carregar esta página</h1>
      <p className="mt-4 max-w-md text-soft">Tente novamente. Se continuar, fale com a barbearia pelo WhatsApp.</p>
      <button type="button" onClick={reset} className={`${buttonClasses("primary", "md")} mt-8`}>
        Tentar de novo
      </button>
    </main>
  );
}
