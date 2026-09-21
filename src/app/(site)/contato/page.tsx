import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/site/section";
import { Location } from "@/features/public/location-section";
import { JsonLd, barberShopJsonLd, breadcrumbJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Contato e localização",
  description:
    "Rua Barão de Piracicamirim, 782, São Dimas, Piracicaba/SP. Horários de funcionamento, mapa e WhatsApp do Fio do Bigode.",
  alternates: { canonical: "/contato" },
};

export default function ContactPage() {
  return (
    <>
      <JsonLd data={barberShopJsonLd()} />
      <JsonLd data={breadcrumbJsonLd([{ name: "Contato", path: "/contato" }])} />
      <PageHeader eyebrow="Contato" title="Venha nos visitar" description="Atendimento com horário agendado e pontual." />
      <Section>
        <Location />
      </Section>
    </>
  );
}
