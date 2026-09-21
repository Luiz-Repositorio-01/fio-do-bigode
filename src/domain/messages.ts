/**
 * Mensagens de WhatsApp montadas a partir de templates + dados reais.
 * O sistema só GERA o texto e o link wa.me; quem envia é uma pessoa da equipe.
 */
import type { Appointment, BusinessSettings, Customer, DataState } from "@/types";
import { formatDateLong, minutesToHHmm, toLocalParts } from "./time";
import { balanceOf } from "./loyalty";
import {
  DEFAULT_TEMPLATES,
  firstName,
  renderTemplate,
  waLink,
  type MessageTemplateKey,
} from "./whatsapp";

export function templateText(settings: BusinessSettings, key: MessageTemplateKey): string {
  const custom = settings.messageTemplates?.[key];
  return custom && custom.trim() ? custom : DEFAULT_TEMPLATES[key];
}

export interface BuiltMessage {
  text: string;
  url: string;
}

export function customerMessage(
  state: DataState,
  key: MessageTemplateKey,
  customer: Customer,
  templateOverride?: string,
): BuiltMessage {
  const template = templateOverride ?? templateText(state.settings, key);
  const text = renderTemplate(template, {
    NOME: firstName(customer.name),
    PONTOS: balanceOf(state.ledger, customer.id),
  });
  return { text, url: waLink(customer.whatsapp, text) };
}

export function appointmentMessage(
  state: DataState,
  key: MessageTemplateKey,
  appointment: Appointment,
): BuiltMessage | null {
  const customer = state.customers.find((c) => c.id === appointment.customerId);
  if (!customer) return null;
  const pro = state.professionals.find((p) => p.id === appointment.professionalId);
  const local = toLocalParts(appointment.startsAt);
  const text = renderTemplate(templateText(state.settings, key), {
    NOME: firstName(customer.name),
    SERVIÇO: appointment.serviceName,
    PROFISSIONAL: pro?.name ?? "equipe",
    DATA: formatDateLong(local.date),
    HORÁRIO: minutesToHHmm(local.minutes),
    PONTOS: balanceOf(state.ledger, customer.id),
  });
  return { text, url: waLink(customer.whatsapp, text) };
}
