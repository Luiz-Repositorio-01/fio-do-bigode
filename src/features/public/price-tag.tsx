import { formatBRL, formatPrice } from "@/domain/pricing";
import type { Service } from "@/types";
import { weekdayShort } from "@/domain/time";

/** Preço do serviço: valor base + regras por dia da semana (ex.: terça e quarta). */
export function PriceTag({ service, align = "right" }: { service: Service; align?: "left" | "right" }) {
  const rule = service.priceRules[0];
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <p className="display text-xl tabular-nums leading-tight">
        {service.priceCents === null ? (
          "Consultar"
        ) : service.priceIsStartingAt ? (
          <>
            <span className="label-caps mr-1.5 text-[11px] text-soft">a partir de</span>
            {formatBRL(service.priceCents)}
          </>
        ) : (
          formatPrice(service.priceCents, false)
        )}
      </p>
      {rule && (
        <p className="label-caps mt-0.5 text-[11px] text-accent-hi">
          {rule.weekdays.map(weekdayShort).join(" e ")}: {formatBRL(rule.priceCents)}
        </p>
      )}
    </div>
  );
}
