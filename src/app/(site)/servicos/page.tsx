import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/site/section";
import { FinalCta } from "@/features/public/final-cta";
import { ServiceList } from "@/features/public/service-list";
import { JsonLd, barberShopJsonLd, breadcrumbJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Serviços e valores",
  description:
    "Corte de cabelo, barba completa, combos, atendimento VIP e tratamentos no Fio do Bigode, em Piracicaba. Veja valores e agende online.",
  alternates: { canonical: "/servicos" },
};

export default function ServicesPage() {
  return (
    <>
      <JsonLd data={barberShopJsonLd()} />
      <JsonLd data={breadcrumbJsonLd([{ name: "Serviços", path: "/servicos" }])} />
      <PageHeader
        eyebrow="Serviços"
        title="Serviços e valores"
        description="Todos os serviços com valor e duração. Preços com “a partir de” podem variar conforme o atendimento."
      />
      <Section>
        <ServiceList />
      </Section>
      <FinalCta />
    </>
  );
}
