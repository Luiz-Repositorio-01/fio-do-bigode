import type { MetadataRoute } from "next";
import { ALLOW_INDEXING, SITE } from "@/config/seed";

export default function robots(): MetadataRoute.Robots {
  // Demonstração: nada é indexado (dados fictícios). Em produção, NEXT_PUBLIC_ALLOW_INDEXING=true.
  if (!ALLOW_INDEXING) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Áreas privadas ou com token: nunca indexar.
        disallow: ["/admin", "/minha-conta", "/agendamento/", "/indique/"],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
