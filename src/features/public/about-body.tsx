"use client";

import { useBusiness } from "@/hooks/use-business";

const PILLARS = [
  { title: "Barba com toalha quente", text: "Um costume antigo, que não se perdeu mesmo com a chegada da tecnologia." },
  { title: "Tradicional e moderno", text: "Cortes de cabelo tradicionais e modernos, com atendimento personalizado." },
  { title: "Loja, bar e produtos", text: "No espaço há loja, serviço de bar e uma linha exclusiva de produtos." },
] as const;

export function AboutBody() {
  const { business } = useBusiness();
  return (
    <div className="grid gap-12 lg:grid-cols-[1.2fr_.8fr]">
      <div>
        <p className="display text-[clamp(1.4rem,2.6vw,2rem)] leading-snug text-balance">{business.description}</p>
      </div>
      <ul className="space-y-4">
        {PILLARS.map((p) => (
          <li key={p.title} className="rounded-md border border-edge bg-panel p-5">
            <h2 className="display text-xl">{p.title}</h2>
            <p className="mt-1.5 text-[15px] text-soft">{p.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
