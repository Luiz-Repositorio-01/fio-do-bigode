"use client";

import { IconStar } from "@/components/ui/icons";
import { formatDateBR } from "@/domain/time";
import { useAppState } from "@/lib/store/store";

export function Reviews({ limit }: { limit?: number }) {
  const { reviews, business } = useAppState();
  const published = reviews
    .filter((r) => r.published)
    .sort((a, b) => b.date.localeCompare(a.date));
  const list = limit ? published.slice(0, limit) : published;
  if (published.length === 0) return null;

  return (
    <div>
      {business.rating && (
        <div className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-2">
          <p className="display text-6xl tabular-nums">{business.rating.value.toFixed(1).replace(".", ",")}</p>
          <div>
            <span className="flex text-accent-hi" aria-label={`Nota ${business.rating.value} de 5`}>
              {Array.from({ length: 5 }, (_, i) => (
                <IconStar key={i} width={20} height={20} />
              ))}
            </span>
            <p className="mt-1 text-sm text-soft">
              {business.rating.count} avaliações de clientes no{" "}
              <a
                href={business.rating.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-edge underline-offset-4 hover:text-fg"
              >
                {business.rating.source}
              </a>
            </p>
          </div>
        </div>
      )}
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {list.map((r) => (
          <li key={r.id} className="flex flex-col justify-between rounded-md border border-edge bg-panel p-5">
            <blockquote className="display text-lg leading-snug">“{r.text}”</blockquote>
            <p className="mt-5 text-sm text-soft">
              <span className="text-fg">{r.authorName}</span> · {formatDateBR(r.date)} ·{" "}
              <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-fg">
                via {r.source}
              </a>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
