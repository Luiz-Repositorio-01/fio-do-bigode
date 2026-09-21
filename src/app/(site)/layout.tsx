import { DemoBanner } from "@/components/site/demo-banner";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { WhatsAppFab } from "@/components/site/whatsapp-fab";
import { ToastProvider } from "@/components/ui/toast";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <ToastProvider>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg"
      >
        Pular para o conteúdo
      </a>
      <DemoBanner />
      <SiteHeader />
      <main id="conteudo">{children}</main>
      <SiteFooter />
      <WhatsAppFab />
    </ToastProvider>
  );
}
