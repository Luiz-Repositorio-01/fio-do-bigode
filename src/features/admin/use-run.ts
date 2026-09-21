"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { DomainError } from "@/services/errors";

export type RunResult<T> = { ok: true; value: T } | { ok: false; error: string; fields?: Record<string, string> };

/** Executa uma ação assíncrona da API com loading, toast de sucesso e mensagem de erro de domínio. */
export function useRun() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<RunResult<T>> => {
      setBusy(true);
      try {
        const value = await fn();
        if (success) toast(success);
        return { ok: true, value };
      } catch (e) {
        const message =
          e instanceof DomainError ? e.message : "Não foi possível concluir. Tente novamente.";
        toast(message, "error");
        return {
          ok: false,
          error: message,
          fields: e instanceof DomainError ? e.fields : undefined,
        };
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  return { busy, run };
}
