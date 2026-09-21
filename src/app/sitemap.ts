import type { MetadataRoute } from "next";
import { ALLOW_INDEXING, SITE } from "@/config/seed";

/** Só páginas públicas e indexáveis. Painel, conta e links por token ficam de fora. */
const PAGES: Array<{ path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly" }> = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/agendar", priority: 0.9, changeFrequency: "monthly" },
  { path: "/servicos", priority: 0.8, changeFrequency: "monthly" },
  { path: "/barbeiros", priority: 0.7, changeFrequency: "monthly" },
  { path: "/galeria", priority: 0.6, changeFrequency: "monthly" },
  { path: "/sobre", priority: 0.6, changeFrequency: "yearly" },
  { path: "/contato", priority: 0.7, changeFrequency: "yearly" },
  { path: "/fidelidade", priority: 0.6, changeFrequency: "monthly" },
  { path: "/politica-de-privacidade", priority: 0.2, changeFrequency: "yearly" },
  { path: "/termos", priority: 0.2, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  if (!ALLOW_INDEXING) return [];
  const lastModified = new Date();
  return PAGES.map((p) => ({ url: `${SITE.url}${p.path}`, lastModified, ...p }));
}
