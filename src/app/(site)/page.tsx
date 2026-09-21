import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "@/components/site/section";
import { SectionHeading } from "@/components/ui/misc";
import { GalleryGrid } from "@/features/public/gallery-section";
import { FinalCta } from "@/features/public/final-cta";
import { Hero } from "@/features/public/hero";
import { HowItWorks } from "@/features/public/how-it-works";
import { LoyaltyTeaser } from "@/features/public/loyalty-teaser";
import { Location } from "@/features/public/location-section";
import { Reviews } from "@/features/public/reviews-section";
import { ServiceList } from "@/features/public/service-list";
import { TeamGrid } from "@/features/public/team-section";
import { JsonLd, barberShopJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: { absolute: "Fio do Bigode Barbearia | Barbearia clássica em Piracicaba, SP" },
  description:
    "Barbearia no bairro São Dimas, em Piracicaba. Barba com toalha quente, cortes tradicionais e modernos. Veja serviços e valores e agende seu horário online.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Fio do Bigode Barbearia — A mais clássica de Piracicaba",
    description: "Barba com toalha quente, cortes tradicionais e modernos. Agende online.",
    url: "/",
  },
};

export default function HomePage() {
  return (
    <>
      <JsonLd data={barberShopJsonLd()} />
      <Hero />

      <Section id="servicos">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 md:mb-12">
          <SectionHeading
            eyebrow="Serviços"
            title="Do corte à barba com toalha quente."
            description="Valores publicados pela barbearia. Em alguns serviços o preço final pode variar."
          />
          <Link href="/servicos" className="label-caps text-sm text-accent-hi underline-offset-8 hover:underline">
            Ver todos os serviços
          </Link>
        </div>
        <ServiceList limitPerGroup={3} />
      </Section>

      <Section id="barbeiros" tone="panel">
        <div className="mb-7 md:mb-12">
          <SectionHeading
            eyebrow="Equipe"
            title="Quem cuida de você."
            description="Escolha seu barbeiro na hora de agendar, ou deixe o sistema encontrar o primeiro horário livre."
          />
        </div>
        <TeamGrid carousel />
      </Section>

      <Section id="como-funciona">
        <div className="mb-7 md:mb-12">
          <SectionHeading eyebrow="Como funciona" title="Agendar leva menos de um minuto." />
        </div>
        <HowItWorks />
      </Section>

      <Section id="fidelidade" className="pt-0 md:pt-0">
        <LoyaltyTeaser />
      </Section>

      <Section id="avaliacoes" tone="panel">
        <div className="mb-7 md:mb-10">
          <SectionHeading eyebrow="Avaliações" title="O que os clientes dizem." />
        </div>
        <Reviews limit={6} carousel />
      </Section>

      <Section id="galeria">
        <div className="mb-7 md:mb-10">
          <SectionHeading eyebrow="Galeria" title="O ambiente, a equipe e o trabalho." />
        </div>
        <GalleryGrid limit={8} carousel />
      </Section>

      <Section id="localizacao" tone="panel">
        <div className="mb-7 md:mb-10">
          <SectionHeading eyebrow="Localização" title="No coração do São Dimas." />
        </div>
        <Location />
      </Section>

      <FinalCta />
    </>
  );
}
