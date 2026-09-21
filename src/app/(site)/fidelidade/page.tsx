import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/site/section";
import { LoyaltyExplainer } from "@/features/public/loyalty-explainer";
import { JsonLd, breadcrumbJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Programa de fidelidade",
  description: "Acumule pontos a cada atendimento no Fio do Bigode, suba de nível e resgate recompensas.",
  alternates: { canonical: "/fidelidade" },
};

export default function LoyaltyPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Fidelidade", path: "/fidelidade" }])} />
      <PageHeader
        eyebrow="Fidelidade"
        title="Cada visita aproxima você de novos benefícios."
        description="As regras abaixo são as vigentes hoje e podem ser atualizadas pela barbearia."
      />
      <Section>
        <LoyaltyExplainer />
      </Section>
    </>
  );
}
