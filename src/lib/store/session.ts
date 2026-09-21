/**
 * Sessão de DEMONSTRAÇÃO (cliente e administrador).
 *
 * ATENÇÃO: isto NÃO é autenticação segura — qualquer pessoa pode "entrar".
 * Existe só para o cliente da barbearia navegar pelos fluxos. No produto real:
 *  - cliente: Supabase Auth (OTP por e-mail / WhatsApp com provedor);
 *  - admin: Supabase Auth + tabela `admins` + RLS.
 */
import { useSyncExternalStore } from "react";

const KEY = "fdb-demo-session";
const REFERRAL_KEY = "fdb-demo-referral";

export interface Session {
  customerId: string | null;
  admin: boolean;
}

const EMPTY: Session = { customerId: null, admin: false };
let cache: Session | null = null;
const listeners = new Set<() => void>();

function read(): Session {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Session>;
      return { customerId: p.customerId ?? null, admin: Boolean(p.admin) };
    }
  } catch {
    /* ignore */
  }
  return EMPTY;
}

export function getSession(): Session {
  if (typeof window === "undefined") return EMPTY;
  if (!cache) cache = read();
  return cache;
}

function write(next: Session) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export const signInCustomer = (customerId: string) => write({ ...getSession(), customerId });
export const signOutCustomer = () => write({ ...getSession(), customerId: null });
export const signInAdmin = () => write({ ...getSession(), admin: true });
export const signOutAdmin = () => write({ ...getSession(), admin: false });

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSession(): Session {
  return useSyncExternalStore(subscribe, getSession, () => EMPTY);
}

/** Código de indicação capturado pelo link /indique/CODIGO neste navegador. */
export function saveReferralCode(code: string) {
  try {
    window.localStorage.setItem(REFERRAL_KEY, code.toUpperCase().slice(0, 20));
  } catch {
    /* ignore */
  }
}
export function readReferralCode(): string | null {
  try {
    return window.localStorage.getItem(REFERRAL_KEY);
  } catch {
    return null;
  }
}
