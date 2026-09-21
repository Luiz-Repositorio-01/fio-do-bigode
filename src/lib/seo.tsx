import { SERVICE_GROUPS, SITE, createSeedState } from "@/config/seed";
import { minutesToHHmm, weekdayLong } from "@/domain/time";
import { businessSchedule } from "@/domain/hours";

/** JSON-LD (schema.org) gerado a partir dos dados oficiais da barbearia. */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function barberShopJsonLd() {
  const s = createSeedState();
  const b = s.business;
  const openingHoursSpecification = businessSchedule(s.hours).flatMap((d) =>
    d.windows.map((w) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: DAY_NAMES[d.weekday],
      opens: minutesToHHmm(w.opensMin),
      closes: minutesToHHmm(w.closesMin),
    })),
  );
  // Sem geo/telefone fixo inventados; sem aggregateRating (avaliações do Avec não são
  // "reviews próprias do site" e o Google as trata como autoavaliação).
  return {
    "@context": "https://schema.org",
    "@type": "BarberShop",
    "@id": `${SITE.url}/#barbershop`,
    name: b.name,
    description: b.description,
    url: SITE.url,
    telephone: `+${b.whatsappE164}`,
    address: {
      "@type": "PostalAddress",
      streetAddress: b.address.street,
      addressLocality: b.address.city,
      addressRegion: b.address.state,
      postalCode: b.address.zip,
      addressCountry: "BR",
    },
    areaServed: { "@type": "City", name: b.address.city },
    openingHoursSpecification,
    sameAs: [b.instagram.url],
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Serviços",
      itemListElement: SERVICE_GROUPS.map((g) => ({
        "@type": "OfferCatalog",
        name: g.label,
        itemListElement: g.ids
          .map((id) => s.services.find((x) => x.id === id))
          .filter((x): x is NonNullable<typeof x> => Boolean(x))
          .map((svc) => ({
            "@type": "Offer",
            ...(svc.priceCents !== null && { price: (svc.priceCents / 100).toFixed(2), priceCurrency: "BRL" }),
            itemOffered: { "@type": "Service", name: svc.name, ...(svc.description && { description: svc.description }) },
          })),
      })),
    },
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Início", path: "/" }, ...items].map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE.url}${it.path}`,
    })),
  };
}

export const weekdayName = weekdayLong;
