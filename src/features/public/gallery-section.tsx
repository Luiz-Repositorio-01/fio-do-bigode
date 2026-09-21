"use client";

import { AnchorButton } from "@/components/ui/button";
import { IconInstagram } from "@/components/ui/icons";
import { INSTAGRAM_HIGHLIGHTS } from "@/config/seed";
import { useBusiness } from "@/hooks/use-business";
import { useAppState } from "@/lib/store/store";

/** Fotos reais cadastradas no admin; enquanto não houver, convida para o Instagram. */
export function GalleryGrid({ limit }: { limit?: number }) {
  const { gallery } = useAppState();
  const { business } = useBusiness();
  const images = limit ? gallery.slice(0, limit) : gallery;

  if (images.length === 0) {
    return (
      <div className="grain relative overflow-hidden rounded-md border border-edge bg-wood px-6 py-14 text-center md:px-12">
        <IconInstagram className="mx-auto text-accent" width={34} height={34} />
        <h3 className="display mt-4 text-2xl md:text-3xl">O dia a dia da barbearia está no Instagram</h3>
        <p className="mx-auto mt-3 max-w-lg text-soft">
          Cortes, barba com toalha quente, a equipe e o ambiente. Acompanhe os destaques e os últimos
          posts.
        </p>
        <ul className="mt-6 flex flex-wrap justify-center gap-2" aria-label="Destaques do Instagram">
          {INSTAGRAM_HIGHLIGHTS.map((h) => (
            <li key={h} className="label-caps rounded-full border border-edge px-3.5 py-1.5 text-xs text-soft">
              {h}
            </li>
          ))}
        </ul>
        <AnchorButton
          href={business.instagram.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8"
        >
          <IconInstagram /> Abrir @{business.instagram.handle}
        </AnchorButton>
      </div>
    );
  }

  return (
    <div>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {images.map((g, i) => (
          <li key={g.id} className={i === 0 ? "col-span-2 row-span-2" : "aspect-[4/5]"}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={g.src}
              alt={g.alt}
              loading="lazy"
              decoding="async"
              className="h-full w-full rounded-md border border-edge object-cover"
            />
          </li>
        ))}
      </ul>
      <div className="mt-8 text-center">
        <AnchorButton
          href={business.instagram.url}
          target="_blank"
          rel="noopener noreferrer"
          variant="secondary"
        >
          <IconInstagram /> Ver mais no @{business.instagram.handle}
        </AnchorButton>
      </div>
    </div>
  );
}
