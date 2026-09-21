import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "whatsapp";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-fg hover:bg-accent-hi shadow-[inset_0_-2px_0_rgba(0,0,0,.22)] disabled:hover:bg-accent",
  secondary:
    "border border-edge bg-transparent text-fg hover:border-accent hover:text-accent-hi",
  ghost: "bg-transparent text-fg hover:bg-panel-2",
  danger: "border border-bad/50 bg-transparent text-bad hover:bg-bad/10",
  whatsapp:
    "bg-[#1f9d55] text-white hover:bg-[#25b463] shadow-[inset_0_-2px_0_rgba(0,0,0,.2)]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5",
  md: "h-11 px-5 text-[15px] gap-2",
  lg: "h-14 px-7 text-base gap-2.5",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", extra = "") {
  return [
    "label-caps inline-flex select-none items-center justify-center rounded-[3px] transition-colors duration-150",
    "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    variants[variant],
    sizes[size],
    extra,
  ].join(" ");
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Carregando"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
    />
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, className)}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

interface LinkButtonProps extends ComponentProps<typeof Link> {
  variant?: Variant;
  size?: Size;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: LinkButtonProps) {
  return <Link className={buttonClasses(variant, size, className)} {...rest} />;
}

interface AnchorButtonProps extends ComponentProps<"a"> {
  variant?: Variant;
  size?: Size;
}

/** <a> externo (WhatsApp, Maps, Instagram). */
export function AnchorButton({
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: AnchorButtonProps) {
  return <a className={buttonClasses(variant, size, className)} {...rest} />;
}
