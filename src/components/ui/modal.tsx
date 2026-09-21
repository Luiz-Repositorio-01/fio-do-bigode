"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { IconX } from "./icons";

/** Diálogo acessível baseado em <dialog> (foco preso, Esc fecha, aria-modal). */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  const width = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-3xl" : "max-w-lg";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="modal-title"
      className={`m-auto w-[calc(100%-2rem)] ${width} rounded-md border border-edge bg-panel p-0 text-fg shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-[2px]`}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-edge px-5 py-4">
            <div>
              <h2 id="modal-title" className="display text-xl">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-soft">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="-mr-1 rounded p-1.5 text-soft hover:bg-panel-2 hover:text-fg"
            >
              <IconX />
            </button>
          </header>
          <div className="overflow-y-auto px-5 py-5">{children}</div>
          {footer && (
            <footer className="flex flex-wrap justify-end gap-2 border-t border-edge px-5 py-4">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}
