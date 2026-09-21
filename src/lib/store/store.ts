/**
 * Armazenamento da VERSÃO DE DEMONSTRAÇÃO.
 *
 * Todo o estado fica no localStorage do navegador — nada sai do aparelho e
 * nenhum backend é chamado. Este módulo é o ÚNICO ponto que conhece o
 * localStorage: ao aprovar o produto, ele é substituído por um adaptador
 * Supabase (mesmos tipos, mesmas funções de serviço).
 */
import { useSyncExternalStore } from "react";
import { DATA_VERSION, createSeedState } from "@/config/seed";
import type { DataState } from "@/types";

export const STORAGE_KEY = "fdb-demo-state";

const SERVER_SNAPSHOT: DataState = createSeedState();
let cache: DataState | null = null;
const listeners = new Set<() => void>();
let storageListening = false;

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // modo privado / cookies bloqueados
  }
}

function isValid(raw: unknown): raw is DataState {
  const s = raw as Partial<DataState> | null;
  return Boolean(
    s &&
      s.version === DATA_VERSION &&
      s.business &&
      s.settings &&
      Array.isArray(s.services) &&
      Array.isArray(s.appointments) &&
      Array.isArray(s.ledger),
  );
}

function load(): DataState {
  const storage = safeStorage();
  if (!storage) return SERVER_SNAPSHOT;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isValid(parsed)) return parsed;
    }
  } catch {
    /* estado corrompido → recomeça do seed */
  }
  return createSeedState();
}

function ensureStorageListener() {
  if (storageListening || typeof window === "undefined") return;
  storageListening = true;
  // Outra aba alterou os dados: recarrega e avisa os componentes.
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY || e.key === null) {
      cache = null;
      listeners.forEach((l) => l());
    }
  });
}

export function getState(): DataState {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  if (!cache) cache = load();
  return cache;
}

export function setState(next: DataState): void {
  cache = next;
  const storage = safeStorage();
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* cota cheia: mantém em memória */
  }
  listeners.forEach((l) => l());
}

/**
 * Lê o estado MAIS RECENTE do disco (protege contra outra aba ter gravado
 * entre a renderização e o clique), aplica a mudança e grava.
 */
export function commit<T>(fn: (state: DataState) => { state: DataState; result: T }): T {
  cache = null;
  const current = getState();
  const { state, result } = fn(current);
  setState(state);
  return result;
}

export function resetState(): void {
  setState(createSeedState());
}

function subscribe(cb: () => void) {
  ensureStorageListener();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useAppState(): DataState {
  return useSyncExternalStore(subscribe, getState, () => SERVER_SNAPSHOT);
}

const noopSubscribe = () => () => {};
/** true apenas no cliente, depois da hidratação (evita flash com dados do seed). */
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
