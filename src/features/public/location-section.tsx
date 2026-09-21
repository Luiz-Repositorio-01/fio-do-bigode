"use client";

import { AnchorButton } from "@/components/ui/button";
import { IconClock, IconPin, IconWhatsApp } from "@/components/ui/icons";
import { mapsEmbedUrl } from "@/domain/calendar";
import { businessSchedule, groupedSchedule } from "@/domain/hours";
import { useBusiness, useOpenStatus } from "@/hooks/use-business";
import { track } from "@/lib/analytics";

export function Location() {
  const { business, hours, addressLine, fullAddress, mapsUrl, whatsapp } = useBusiness();
  const status = useOpenStatus();
  const schedule = groupedSchedule(businessSchedule(hours));

  return (
    <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
      <div className="space-y-6 rounded-md border border-edge bg-panel p-6 md:p-8">
        <div className="flex gap-4">
          <IconPin className="mt-1 shrink-0 text-accent" />
          <div>
            <h3 className="display text-xl">Endereço</h3>
            <p className="mt-1 text-soft">
              {addressLine}
              <br />
              CEP {business.address.zip}
            </p>
          </div>
        </div>
        <div className="flex gap-4">
          <IconClock className="mt-1 shrink-0 text-accent" />
          <div className="flex-1">
            <h3 className="display text-xl">Horários</h3>
            {status && (
              <p className={`label-caps mt-1 text-xs ${status.isOpen ? "text-good" : "text-soft"}`}>{status.label}</p>
            )}
            <dl className="mt-3 space-y-1.5 text-[15px]">
              {schedule.map((row) => (
                <div key={row.label} className="flex justify-between gap-4 border-b border-edge/60 pb-1.5">
                  <dt className="text-soft">{row.label}</dt>
                  <dd className="tabular-nums">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <AnchorButton href={mapsUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
            <IconPin width={18} height={18} /> Como chegar
          </AnchorButton>
          <AnchorButton
            href={whatsapp("Olá! Vim pelo site do Fio do Bigode.")}
            target="_blank"
            rel="noopener noreferrer"
            variant="whatsapp"
            className="flex-1"
            onClick={() => track("click_whatsapp", { origin: "location" })}
          >
            <IconWhatsApp width={18} height={18} /> {business.whatsappDisplay}
          </AnchorButton>
        </div>
      </div>
      <div className="min-h-80 overflow-hidden rounded-md border border-edge bg-wood">
        <iframe
          title={`Mapa: ${fullAddress}`}
          src={mapsEmbedUrl(fullAddress)}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="h-full min-h-80 w-full border-0 [filter:grayscale(.55)_contrast(1.05)_invert(.92)_hue-rotate(180deg)]"
        />
      </div>
    </div>
  );
}
