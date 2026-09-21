import Link from "next/link";

/** Bigode decorativo (usado quando não há foto no destaque). O logotipo oficial fica em public/brand/logo.jpg. */
export function MoustacheMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 28" aria-hidden className={className} fill="currentColor">
      <path d="M32 9.5c-2.4-3-5.4-5-9.6-5C15.6 4.5 9 7.6 3.5 14c-1 1.2-.6 2 .6 1.9 4.2-.5 6.6.8 9.6 3.3 4.2 3.6 9.6 5.1 14.6 2.4 1.4-.8 2.6-2.1 3.7-4 1.1 1.9 2.3 3.2 3.7 4 5 2.7 10.4 1.2 14.6-2.4 3-2.5 5.4-3.8 9.6-3.3 1.2.1 1.6-.7.6-1.9C55 7.6 48.4 4.5 41.6 4.5c-4.200 0-7.200 2-9.600 5Z" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="group inline-flex items-center gap-3" aria-label="Fio do Bigode Barbearia — página inicial">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/logo.jpg"
        alt=""
        width={40}
        height={40}
        className="h-10 w-10 shrink-0 rounded-full border border-accent/40 bg-white object-cover"
      />
      <span className="leading-none">
        <span className="display block text-[1.35rem] tracking-[0.02em]">Fio do Bigode</span>
        {!compact && (
          <span className="label-caps mt-1 block text-[10.5px] text-soft">Barbearia · Piracicaba</span>
        )}
      </span>
    </Link>
  );
}
