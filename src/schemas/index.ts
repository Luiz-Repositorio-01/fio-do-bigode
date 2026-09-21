import { z } from "zod";
import { isValidDateString } from "@/domain/time";
import { normalizeWhatsApp } from "@/domain/whatsapp";

const trimmed = (max: number) => z.string().trim().max(max);

export const whatsappSchema = z
  .string()
  .trim()
  .min(1, "Informe seu WhatsApp.")
  .transform((v, ctx) => {
    const n = normalizeWhatsApp(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "WhatsApp inválido. Use DDD + número." });
      return z.NEVER;
    }
    return n;
  });

const optionalEmail = z
  .string()
  .trim()
  .max(120)
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.union([z.null(), z.email("E-mail inválido.")]));

const optionalBirthDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .refine(
    (v) => v === null || (isValidDateString(v) && v <= new Date().toISOString().slice(0, 10) && v >= "1900-01-01"),
    "Data de nascimento inválida.",
  );

export const customerContactSchema = z.object({
  name: trimmed(80).min(2, "Informe seu nome."),
  whatsapp: whatsappSchema,
  email: optionalEmail,
  birthDate: optionalBirthDate,
});
export type CustomerContactInput = z.input<typeof customerContactSchema>;

export const bookingSchema = z.object({
  serviceId: z.string().min(1),
  /** ID do profissional ou "any" para qualquer disponível. */
  professionalId: z.string().min(1),
  startsAt: z.iso.datetime({ offset: true }),
  name: customerContactSchema.shape.name,
  whatsapp: whatsappSchema,
  email: optionalEmail,
  birthDate: optionalBirthDate,
  notes: trimmed(300).optional().default(""),
  referralCode: z.string().trim().max(20).nullish(),
});
export type BookingInput = z.input<typeof bookingSchema>;

export const loginSchema = z.object({ whatsapp: whatsappSchema });

export const serviceFormSchema = z.object({
  name: trimmed(80).min(2, "Informe o nome."),
  description: trimmed(300),
  priceReais: z.number().min(0).max(5000).nullable(),
  priceIsStartingAt: z.boolean(),
  durationMinutes: z.number().int().min(5, "Mínimo 5 min").max(480),
  pointsBonus: z.number().int().min(0).max(10000),
  active: z.boolean(),
});

export const rewardFormSchema = z.object({
  name: trimmed(80).min(2, "Informe o nome."),
  description: trimmed(300),
  kind: z.enum(["discount", "free_service", "upgrade", "other"]),
  costPoints: z.number().int().min(0).max(1_000_000),
  validityDays: z.number().int().min(1).max(3650).nullable(),
  stock: z.number().int().min(0).max(100000).nullable(),
  active: z.boolean(),
});

export const levelFormSchema = z.object({
  name: trimmed(30).min(2, "Informe o nome."),
  minPoints: z.number().int().min(0).max(10_000_000),
  discountPercent: z.number().min(0).max(100).nullable(),
  benefits: trimmed(300),
  isVip: z.boolean(),
});

export const blockFormSchema = z
  .object({
    professionalId: z.string().nullable(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    kind: z.enum(["block", "vacation", "holiday", "maintenance"]),
    reason: trimmed(120),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: "O fim precisa ser depois do início.",
    path: ["endsAt"],
  });

/** Converte issues do Zod em { campo: mensagem }. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
