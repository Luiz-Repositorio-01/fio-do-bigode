"use client";

import Link from "next/link";
import { IconStar } from "@/components/ui/icons";
import { PhotoSlot } from "@/components/ui/misc";
import { track } from "@/lib/analytics";
import { useAppState } from "@/lib/store/store";

export function TeamGrid({ carousel = false }: { carousel?: boolean }) {
  const { professionals } = useAppState();
  const team = professionals.filter((p) => p.active).sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <ul
      className={
        carousel
          ? "snap-row -mx-5 flex gap-4 overflow-x-auto px-5 pb-3 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3"
          : "grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
      }
    >
      {team.map((p) => (
        <li
          key={p.id}
          className={`group flex flex-col overflow-hidden rounded-md border border-edge bg-panel ${carousel ? "w-[74%] shrink-0 sm:w-auto" : ""}`}
        >
          <div className="relative">
            {p.photoUrl ? (
              <PhotoSlot src={p.photoUrl} alt={`Foto de ${p.name}`} className={`w-full object-top ${carousel ? "aspect-[4/5]" : "aspect-square sm:aspect-[4/5]"}`} />
            ) : (
              <div className="grain relative flex aspect-square sm:aspect-[4/5] items-center justify-center overflow-hidden bg-wood">
                <div className="pole pole-anim absolute inset-y-0 left-0 w-2.5 opacity-70" aria-hidden />
                <span className="display text-7xl text-accent/80" aria-hidden>
                  {p.name[0]}
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col p-4 sm:p-5">
            <p className="label-caps text-[11px] text-soft">Barbeiro</p>
            <h3 className="display text-[1.4rem] sm:text-2xl">{p.name}</h3>
            {p.externalRating && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-soft">
                <IconStar width={14} height={14} className="text-accent-hi" />
                <span className="tabular-nums text-fg">
                  {p.externalRating.value.toFixed(1).replace(".", ",")}
                </span>
                · {p.externalRating.count} avaliações no {p.externalRating.source}
              </p>
            )}
            {p.specialties.length > 0 && (
              <p className="mt-2 text-sm text-soft">{p.specialties.join(" · ")}</p>
            )}
            {p.bio && <p className="mt-2 text-[15px] text-soft">{p.bio}</p>}
            <Link
              href={`/agendar?profissional=${p.id}`}
              onClick={() => track("select_professional", { professional: p.name, origin: "team" })}
              className="label-caps mt-4 inline-flex h-11 sm:mt-5 sm:h-10 items-center justify-center rounded-[3px] border border-accent/60 text-sm text-accent-hi transition-colors hover:bg-accent hover:text-accent-fg"
            >
              Agendar com {p.name}
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
