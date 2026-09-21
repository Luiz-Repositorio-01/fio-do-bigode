"use client";

import { useEffect, useState } from "react";

/** Relógio que atualiza a cada `intervalMs` (padrão: 30 s). Começa com o instante da montagem. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
