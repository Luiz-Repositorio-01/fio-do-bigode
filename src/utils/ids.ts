/** Geração de identificadores. Usa a Web Crypto API (navegador e Node 22). */

export function newId(prefix = ""): string {
  const id = globalThis.crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

/** Token opaco (URL-safe) para links de gerenciamento de agendamento. */
export function secureToken(bytes = 24): string {
  return Array.from(randomBytes(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Sem 0/O/1/I para evitar confusão ao ditar o código no balcão.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Código de resgate de benefício, ex.: "FDB-7KQ2-M9XT" (pronto para virar QR Code). */
export function rewardCode(): string {
  const chars = Array.from(randomBytes(8), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  return `FDB-${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Código de indicação legível: primeiro nome + 3 dígitos (ex.: JOAO123). */
export function referralCodeFor(name: string, taken: Set<string>): string {
  const base =
    stripAccents(name.trim().split(/\s+/)[0] ?? "")
      .replace(/[^a-zA-Z]/g, "")
      .toUpperCase()
      .slice(0, 8) || "CLIENTE";
  for (let i = 0; i < 50; i++) {
    const n = 100 + (randomBytes(2).reduce((a, b) => a * 256 + b, 0) % 900);
    const code = `${base}${n}`;
    if (!taken.has(code)) return code;
  }
  return `${base}${secureToken(3).toUpperCase()}`;
}
