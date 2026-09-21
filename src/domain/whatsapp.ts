/**
 * WhatsApp por link (wa.me).
 *
 * Sem WhatsApp Business API, o sistema NÃO envia mensagens sozinho: ele abre o
 * WhatsApp (do cliente ou da equipe) com o texto pronto. Toda interface deve
 * deixar isso claro. A arquitetura de mensagens (templates + variáveis) já está
 * pronta para uma futura integração com a API oficial.
 */

/** Normaliza telefone brasileiro para E.164 sem "+" (ex.: 5519998647135). */
export function normalizeWhatsApp(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (!/^55\d{10,11}$/.test(digits)) return null;
  const ddd = Number(digits.slice(2, 4));
  if (ddd < 11 || ddd > 99) return null;
  const local = digits.slice(4);
  if (local.length === 9 && local[0] !== "9") return null;
  return digits;
}

export function formatPhoneBR(e164: string): string {
  const d = e164.replace(/\D/g, "");
  const local = d.startsWith("55") ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return e164;
}

export function waLink(e164: string, text?: string): string {
  const base = `https://wa.me/${e164.replace(/\D/g, "")}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export type MessageTemplateKey =
  | "confirmation"
  | "reminder"
  | "cancellation"
  | "reschedule"
  | "winback"
  | "birthday"
  | "loyalty";

export const MESSAGE_TEMPLATE_LABELS: Record<MessageTemplateKey, string> = {
  confirmation: "Confirmação de agendamento",
  reminder: "Lembrete",
  cancellation: "Cancelamento",
  reschedule: "Reagendamento",
  winback: "Recuperação de cliente",
  birthday: "Aniversário",
  loyalty: "Fidelidade",
};

export const DEFAULT_TEMPLATES: Record<MessageTemplateKey, string> = {
  confirmation:
    "Olá, {NOME}! Seu horário no Fio do Bigode foi agendado.\nServiço: {SERVIÇO}\nProfissional: {PROFISSIONAL}\nData: {DATA}\nHorário: {HORÁRIO}\nAté lá!",
  reminder:
    "Olá, {NOME}! Passando para lembrar do seu horário no Fio do Bigode.\nServiço: {SERVIÇO}\nProfissional: {PROFISSIONAL}\nData: {DATA}\nHorário: {HORÁRIO}\nPode confirmar sua presença?",
  cancellation:
    "Olá, {NOME}! Seu horário no Fio do Bigode ({SERVIÇO}, {DATA} às {HORÁRIO}) foi cancelado. Quando quiser, é só agendar um novo horário.",
  reschedule:
    "Olá, {NOME}! Seu horário no Fio do Bigode foi remarcado.\nServiço: {SERVIÇO}\nProfissional: {PROFISSIONAL}\nNovo horário: {DATA} às {HORÁRIO}\nAté lá!",
  winback:
    "Olá, {NOME}! Faz um tempinho que você não passa aqui no Fio do Bigode. Que tal garantir seu próximo horário?",
  birthday:
    "Olá, {NOME}! A equipe do Fio do Bigode deseja um feliz aniversário!",
  loyalty:
    "Olá, {NOME}! Você tem {PONTOS} pontos no programa de fidelidade do Fio do Bigode.",
};

export function renderTemplate(
  template: string,
  vars: Record<string, string | number | undefined>,
): string {
  return template.replace(/\{([^}]+)\}/g, (match, key: string) => {
    const v = vars[key.trim().toUpperCase()];
    return v === undefined ? match : String(v);
  });
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
