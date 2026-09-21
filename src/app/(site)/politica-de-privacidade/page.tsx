import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/site/section";
import { LegalDoc } from "@/features/public/legal-doc";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description: "Como o Fio do Bigode Barbearia trata os dados pessoais de clientes, conforme a LGPD.",
  alternates: { canonical: "/politica-de-privacidade" },
};

export default function PrivacyPage() {
  return (
    <>
      <PageHeader eyebrow="Legal" title="Política de privacidade" />
      <Section>
        <LegalDoc kind="privacy" />
      </Section>
    </>
  );
}
