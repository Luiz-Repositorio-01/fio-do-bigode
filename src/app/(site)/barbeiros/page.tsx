import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/site/section";
import { FinalCta } from "@/features/public/final-cta";
import { TeamGrid } from "@/features/public/team-section";
import { JsonLd, breadcrumbJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Barbeiros",
  description: "Conheça a equipe de barbeiros do Fio do Bigode, em Piracicaba, e agende com o profissional de sua preferência.",
  alternates: { canonical: "/barbeiros" },
};

export default function BarbersPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Barbeiros", path: "/barbeiros" }])} />
      <PageHeader
        eyebrow="Equipe"
        title="Os barbeiros do Fio do Bigode"
        description="Agende com quem você já confia ou escolha “qualquer profissional” na hora de reservar."
      />
      <Section>
        <TeamGrid />
      </Section>
      <FinalCta />
    </>
  );
}
