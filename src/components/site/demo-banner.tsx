import { IconInfo } from "@/components/ui/icons";

export function DemoBanner() {
  return (
    <div className="border-b border-accent/30 bg-accent/10 px-4 py-2 text-center text-[13px] text-fg">
      <IconInfo className="mr-1.5 mb-0.5 inline h-4 w-4 text-accent-hi" />
      <strong className="label-caps mr-1.5 text-accent-hi">Versão de demonstração</strong>
      Agendamentos e cadastros ficam salvos apenas neste navegador e não são enviados à barbearia.
    </div>
  );
}
