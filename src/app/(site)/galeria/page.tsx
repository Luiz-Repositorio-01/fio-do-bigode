import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/site/section";
import { FinalCta } from "@/features/public/final-cta";
import { GalleryGrid } from "@/features/public/gallery-section";
import { JsonLd, breadcrumbJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Galeria",
  description: "Fotos da barbearia, da equipe e dos trabalhos do Fio do Bigode, em Piracicaba.",
  alternates: { canonical: "/galeria" },
};

export default function GalleryPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Galeria", path: "/galeria" }])} />
      <PageHeader eyebrow="Galeria" title="O ambiente, a equipe e o trabalho" />
      <Section>
        <GalleryGrid />
      </Section>
      <FinalCta />
    </>
  );
}
