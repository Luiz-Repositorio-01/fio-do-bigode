import type { ReactNode } from "react";

export function Section({
  id,
  children,
  className = "",
  tone = "default",
}: {
  id?: string;
  children: ReactNode;
  className?: string;
  tone?: "default" | "panel";
}) {
  return (
    <section
      id={id}
      className={`${tone === "panel" ? "border-y border-edge bg-panel" : ""} py-20 md:py-28 ${className}`}
    >
      <div className="mx-auto max-w-6xl px-5">{children}</div>
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="grain relative isolate overflow-hidden border-b border-edge bg-wood">
      <div className="pole pole-anim absolute inset-x-0 bottom-0 h-1 opacity-70" aria-hidden />
      <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        {eyebrow && <p className="label-caps mb-3 text-sm text-accent-hi">{eyebrow}</p>}
        <h1 className="display max-w-3xl text-[clamp(2.3rem,6vw,4.4rem)] leading-[1.03] text-balance">{title}</h1>
        {description && <p className="mt-5 max-w-2xl text-lg text-soft">{description}</p>}
      </div>
    </header>
  );
}
