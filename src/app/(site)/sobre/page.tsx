import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/site/section";
import { FinalCta } from "@/features/public/final-cta";
import { Reviews } from "@/features/public/reviews-section";
import { AboutBody } from "@/features/public/about-body";
import { JsonLd, breadcrumbJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Sobre a barbearia",
  description:
    "Fio do Bigode mescla o tradicional e o moderno: barba com toalha quente, cortes tradicionais e modernos, loja, serviço de bar e linha exclusiva de produtos.",
  alternates: { canonical: "/sobre" },
};

export default function AboutPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Sobre", path: "/sobre" }])} />
      <PageHeader eyebrow="Sobre" title="Confiança, tradição e acabamento impecável" />
      <Section>
        <AboutBody />
      </Section>
      <Section tone="panel">
        <Reviews />
      </Section>
      <FinalCta />
    </>
  );
}
