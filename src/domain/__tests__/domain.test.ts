import { describe, expect, it } from "vitest";
import { buildICS, googleCalendarUrl } from "../calendar";
import { customerMetrics, daysUntilBirthday, inSegment, segmentsFor } from "../customers";
import { appointmentMessage, customerMessage } from "../messages";
import { centsToInput, formatBRL, formatDuration, parseReaisToCents, priceFor } from "../pricing";
import { dashboardStats } from "../reports";
import {
  addDays,
  diffDays,
  formatDateLong,
  fromLocal,
  hhmmToMinutes,
  isValidDateString,
  minutesToHHmm,
  toLocalParts,
  weekdayOf,
} from "../time";
import { firstName, formatPhoneBR, normalizeWhatsApp, renderTemplate, waLink } from "../whatsapp";
import { completeAppointment, createBooking } from "@/services/booking";
import { NOW, TUESDAY, at, freshState, person } from "@/services/__tests__/helpers";

describe("WhatsApp", () => {
  it("normaliza números brasileiros para E.164", () => {
    expect(normalizeWhatsApp("(19) 99864-7135")).toBe("5519998647135");
    expect(normalizeWhatsApp("19998647135")).toBe("5519998647135");
    expect(normalizeWhatsApp("+55 19 99864-7135")).toBe("5519998647135");
    expect(normalizeWhatsApp("5519998647135")).toBe("5519998647135");
    expect(normalizeWhatsApp("1934221234")).toBe("551934221234"); // fixo
  });
  it("rejeita números inválidos", () => {
    expect(normalizeWhatsApp("123")).toBeNull();
    expect(normalizeWhatsApp("(00) 99999-9999")).toBeNull();
    expect(normalizeWhatsApp("(19) 89864-7135")).toBeNull(); // celular sem o 9
    expect(normalizeWhatsApp("abc")).toBeNull();
  });
  it("formata e monta link wa.me com texto codificado", () => {
    expect(formatPhoneBR("5519998647135")).toBe("(19) 99864-7135");
    const url = waLink("5519998647135", "Olá, João! 100%");
    expect(url).toBe("https://wa.me/5519998647135?text=Ol%C3%A1%2C%20Jo%C3%A3o!%20100%25");
    expect(waLink("+55 19 99864-7135")).toBe("https://wa.me/5519998647135");
  });
  it("renderiza templates sem quebrar variáveis desconhecidas", () => {
    expect(renderTemplate("Oi {nome}, {HORÁRIO} {X}", { NOME: "Ana", HORÁRIO: "14:00" })).toBe("Oi Ana, 14:00 {X}");
    expect(firstName("  Maria  da Silva ")).toBe("Maria");
  });
});

describe("tempo (fuso da barbearia, UTC-03)", () => {
  it("converte ida e volta sem depender do fuso do servidor", () => {
    const iso = fromLocal("2026-09-22", 14 * 60);
    expect(iso).toBe("2026-09-22T17:00:00.000Z");
    expect(toLocalParts(iso)).toEqual({ date: "2026-09-22", minutes: 840, weekday: 2 });
  });
  it("vira o dia corretamente perto da meia-noite", () => {
    expect(toLocalParts("2026-09-23T02:30:00.000Z").date).toBe("2026-09-22");
    expect(toLocalParts("2026-09-23T03:00:00.000Z").date).toBe("2026-09-23");
  });
  it("datas: soma, diferença, validação e dia da semana", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2026-09-21", "2026-10-01")).toBe(10);
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("2028-02-29")).toBe(true);
    expect(weekdayOf("2026-09-21")).toBe(1);
    expect(formatDateLong("2026-09-22")).toBe("terça-feira, 22 de setembro");
    expect(minutesToHHmm(545)).toBe("09:05");
    expect(hhmmToMinutes("09:05")).toBe(545);
  });
});

describe("preço", () => {
  it("aplica regra por dia da semana e formata em reais", () => {
    const s = freshState();
    const corte = s.services.find((x) => x.id === "svc_corte")!;
    expect(priceFor(corte, 2)).not.toBe(priceFor(corte, 1)); // terça em promoção
    expect(formatBRL(4500)).toContain("45,00");
    expect(formatBRL(null)).toBe("Consultar");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(90)).toBe("1h30");
  });
  it("interpreta valores digitados", () => {
    expect(parseReaisToCents("45")).toBe(4500);
    expect(parseReaisToCents("45,5")).toBe(4550);
    expect(parseReaisToCents("R$ 1.234,50")).toBe(123450);
    expect(parseReaisToCents("45.5")).toBe(4550);
    expect(parseReaisToCents("")).toBeNull();
    expect(parseReaisToCents("abc")).toBeNull();
    expect(parseReaisToCents("-5")).toBeNull();
    expect(centsToInput(4550)).toBe("45,50");
  });
});

describe("calendário (.ics)", () => {
  const ev = {
    uid: "abc",
    title: "Corte; barba, toalha",
    description: "linha1\nlinha2",
    location: "Rua A, 1",
    startsAt: "2026-09-22T17:00:00.000Z",
    endsAt: "2026-09-22T17:45:00.000Z",
  };
  it("gera VEVENT válido com datas em UTC e escapes corretos", () => {
    const ics = buildICS(ev);
    expect(ics).toContain("DTSTART:20260922T170000Z");
    expect(ics).toContain("DTEND:20260922T174500Z");
    expect(ics).toContain(String.raw`SUMMARY:Corte\; barba\, toalha`);
    expect(ics).toContain("DESCRIPTION:linha1\\nlinha2");
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.trim().endsWith("END:VCALENDAR")).toBe(true);
  });
  it("gera link do Google Agenda", () => {
    const url = googleCalendarUrl(ev);
    expect(url).toContain("calendar.google.com");
    expect(url).toContain("20260922T170000Z");
  });
});

describe("CRM: métricas, aniversário e segmentos", () => {
  function scenario() {
    let s = freshState();
    // 3 visitas concluídas, a última há ~40 dias → inativo (30+) e recorrente (3+)
    const p = person(1);
    for (const [i, date] of ["2026-07-28", "2026-08-04", "2026-08-11"].entries()) {
      const r = createBooking(
        s,
        { serviceId: "svc_corte", professionalId: "pro_henrique", startsAt: at(date, "10:00"), ...p, email: "", notes: "" },
        new Date(fromLocal(date, 60)).getTime(),
        { source: "admin" },
      );
      s = completeAppointment(r.state, { appointmentId: r.appointment.id, finalPriceCents: 5000 + i * 1000 }, new Date(fromLocal(date, 12 * 60)).getTime()).state;
    }
    return s;
  }

  it("calcula visitas, gasto, ticket médio e última visita", () => {
    const s = scenario();
    const c = s.customers[0];
    const m = customerMetrics(c.id, s.appointments, NOW);
    expect(m.visits).toBe(3);
    expect(m.totalSpentCents).toBe(5000 + 6000 + 7000);
    expect(m.avgTicketCents).toBe(6000);
    expect(m.lastVisitAt).toContain("2026-08-11");
    expect(m.noShows).toBe(0);
  });

  it("classifica recorrente e inativo (sem horário futuro)", () => {
    const s = scenario();
    const c = s.customers[0];
    const m = customerMetrics(c.id, s.appointments, NOW);
    const seg = segmentsFor({ customer: c, metrics: m, ledger: s.ledger, levels: s.levels, settings: s.settings, now: NOW });
    expect(seg.isRecurring).toBe(true);
    expect(seg.isInactive).toBe(true);
    expect(seg.inactiveBucket).toBe(30);
    expect(inSegment("inactive", seg, 7)).toBe(true);
    expect(inSegment("active", seg, 7)).toBe(false);
    expect(inSegment("vip", seg, 7)).toBe(false);
  });

  it("cliente com horário futuro não é inativo", () => {
    let s = scenario();
    const r = createBooking(
      s,
      { serviceId: "svc_corte", professionalId: "pro_henrique", startsAt: at(TUESDAY, "15:00"), ...person(1), email: "", notes: "" },
      NOW,
    );
    s = r.state;
    const c = s.customers[0];
    const m = customerMetrics(c.id, s.appointments, NOW);
    const seg = segmentsFor({ customer: c, metrics: m, ledger: s.ledger, levels: s.levels, settings: s.settings, now: NOW });
    expect(seg.isInactive).toBe(false);
  });

  it("dias até o aniversário, inclusive virada de ano e 29/02", () => {
    expect(daysUntilBirthday("1990-09-21", "2026-09-21")).toBe(0);
    expect(daysUntilBirthday("1990-09-28", "2026-09-21")).toBe(7);
    expect(daysUntilBirthday("1990-01-05", "2026-12-30")).toBe(6);
    expect(daysUntilBirthday("2000-02-29", "2026-02-20")).toBe(8); // 28/02 em ano não bissexto
    expect(daysUntilBirthday(null, "2026-09-21")).toBeNull();
  });
});

describe("mensagens de WhatsApp", () => {
  it("monta lembrete com dados reais do agendamento", () => {
    const s = freshState();
    const r = createBooking(
      s,
      { serviceId: "svc_corte", professionalId: "pro_henrique", startsAt: at(TUESDAY, "14:00"), ...person(1), email: "", notes: "" },
      NOW,
    );
    const msg = appointmentMessage(r.state, "reminder", r.appointment)!;
    expect(msg.text).toContain("Cliente");
    expect(msg.text).toContain("14:00");
    expect(msg.text).toContain("terça-feira, 22 de setembro");
    expect(msg.url.startsWith(`https://wa.me/${r.customer.whatsapp}?text=`)).toBe(true);
  });
  it("usa o modelo personalizado quando existe e volta ao padrão quando vazio", () => {
    let s = freshState();
    const c = { id: "c1", businessId: s.business.id, name: "João Silva", whatsapp: "5519998647135", email: null, birthDate: null, referralCode: "JOAO123", referredByCustomerId: null, createdAt: "2026-01-01T00:00:00.000Z", isDemo: false };
    s = { ...s, customers: [c], settings: { ...s.settings, messageTemplates: { winback: "Fala {NOME}, bora?" } } };
    expect(customerMessage(s, "winback", c).text).toBe("Fala João, bora?");
    s = { ...s, settings: { ...s.settings, messageTemplates: { winback: "  " } } };
    expect(customerMessage(s, "winback", c).text).toContain("Faz um tempinho");
  });
});

describe("dashboard", () => {
  it("soma faturamento do mês só de atendimentos concluídos e ignora cancelados", () => {
    const s0 = freshState();
    const mk = (n: number, hhmm: string) =>
      createBooking(s0, { serviceId: "svc_corte", professionalId: "pro_henrique", startsAt: at(TUESDAY, hhmm), ...person(n), email: "", notes: "" }, NOW, { source: "admin" });
    let s = mk(1, "10:00").state;
    const a1 = s.appointments[0];
    s = completeAppointment(s, { appointmentId: a1.id, finalPriceCents: 4000 }, NOW).state;
    const r2 = createBooking(s, { serviceId: "svc_corte", professionalId: "pro_henrique", startsAt: at(TUESDAY, "11:00"), ...person(2), email: "", notes: "" }, NOW, { source: "admin" });
    s = r2.state;
    const stats = dashboardStats(s, new Date(fromLocal(TUESDAY, 13 * 60)).getTime());
    expect(stats.monthRevenueCents).toBe(4000);
    expect(stats.monthCompleted).toBe(1);
    expect(stats.todayAppointments).toHaveLength(2);
    expect(stats.totalCustomers).toBe(2);
    expect(stats.topServices[0]).toMatchObject({ count: 1, cents: 4000 });
  });
});
