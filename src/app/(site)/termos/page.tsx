import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/site/section";
import { LegalDoc } from "@/features/public/legal-doc";

export const metadata: Metadata = {
  title: "Termos de uso",
  description: "Condições de uso do agendamento online e do programa de fidelidade do Fio do Bigode.",
  alternates: { canonical: "/termos" },
};

export default function TermsPage() {
  return (
    <>
      <PageHeader eyebrow="Legal" title="Termos de uso" />
      <Section>
        <LegalDoc kind="terms" />
      </Section>
    </>
  );
}
