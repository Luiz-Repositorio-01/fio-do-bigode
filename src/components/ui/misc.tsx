import type { ReactNode } from "react";

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "accent";
  className?: string;
}) {
  const tones = {
    neutral: "border-edge text-soft",
    good: "border-good/40 bg-good/10 text-good",
    warn: "border-caution/40 bg-caution/10 text-caution",
    bad: "border-bad/40 bg-bad/10 text-bad",
    accent: "border-accent/50 bg-accent/10 text-accent-hi",
  };
  return (
    <span
      className={`label-caps inline-flex items-center gap-1 rounded-[3px] border px-2 py-0.5 text-[11px] ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse-soft rounded bg-panel-2 ${className}`} />;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-md border border-dashed border-edge px-6 py-10 text-center">
      {icon && <div className="mb-3 text-accent">{icon}</div>}
      <p className="display text-lg">{title}</p>
      {description && <p className="mt-1.5 max-w-md text-sm text-soft">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "bad" | "good";
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: "border-accent/40 bg-accent/10",
    warn: "border-caution/40 bg-caution/10",
    bad: "border-bad/40 bg-bad/10",
    good: "border-good/40 bg-good/10",
  };
  return (
    <div role={tone === "bad" ? "alert" : undefined} className={`rounded-md border px-4 py-3 text-sm ${tones[tone]}`}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? "mt-0.5 text-soft" : ""}>{children}</div>
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow && <p className="label-caps mb-3 text-sm text-accent-hi">{eyebrow}</p>}
      <h2 className="display text-[clamp(1.9rem,4.2vw,3rem)] leading-[1.08]">{title}</h2>
      {description && <p className="mt-4 text-lg text-soft">{description}</p>}
    </div>
  );
}

/** Foto real quando existir; senão, moldura de marca (nunca imagem inventada). */
export function PhotoSlot({
  src,
  alt,
  className = "",
  caption,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  caption?: string;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} loading="lazy" decoding="async" className={`object-cover ${className}`} />;
  }
  return (
    <div
      role="img"
      aria-label={alt}
      className={`grain relative flex items-end overflow-hidden bg-wood ${className}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(201,153,63,.18),transparent_60%)]" />
      {caption && <span className="label-caps relative m-3 text-xs text-muted">{caption}</span>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-edge bg-panel p-4">
      <p className="label-caps text-xs text-soft">{label}</p>
      <p className="display mt-1.5 text-3xl tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-soft">{hint}</p>}
    </div>
  );
}
