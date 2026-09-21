import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="conteudo" className="flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <p className="label-caps text-sm text-accent-hi">Erro 404</p>
      <h1 className="display mt-3 text-5xl">Página não encontrada</h1>
      <p className="mt-4 max-w-md text-soft">O endereço pode ter mudado ou nunca ter existido.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className={buttonClasses("primary", "md")}>Voltar ao início</Link>
        <Link href="/agendar" className={buttonClasses("secondary", "md")}>Agendar horário</Link>
      </div>
    </main>
  );
}
