import { IconInfo } from "@/components/ui/icons";

export function DemoBanner() {
  return (
    <div className="border-b border-accent/30 bg-accent/10 px-4 py-1.5 text-center text-[12px] leading-snug text-fg sm:py-2 sm:text-[13px]">
      <IconInfo className="mr-1.5 mb-0.5 inline h-3.5 w-3.5 text-accent-hi sm:h-4 sm:w-4" />
      <strong className="label-caps mr-1.5 text-accent-hi">Versão de demonstração</strong>
      <span className="hidden sm:inline">
        Agendamentos e cadastros ficam salvos apenas neste navegador e não são enviados à barbearia.
      </span>
    </div>
  );
}
