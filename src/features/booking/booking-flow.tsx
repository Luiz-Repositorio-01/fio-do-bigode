"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Button, LinkButton } from "@/components/ui/button";
import { IconCheck } from "@/components/ui/icons";
import { EmptyState, Notice } from "@/components/ui/misc";
import { TextArea, TextField } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { computeSlots, daysWithAvailability, uniqueStarts } from "@/domain/availability";
import { priceFor, formatDuration, formatPrice } from "@/domain/pricing";
import { addDays, formatDateLong, todayLocal, toLocalParts } from "@/domain/time";
import { formatPhoneBR, normalizeWhatsApp } from "@/domain/whatsapp";
import { useNow } from "@/hooks/use-now";
import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
import { readReferralCode, signInCustomer, useSession } from "@/lib/store/session";
import { useAppState, useHydrated } from "@/lib/store/store";
import { availabilityContext, eligibleProfessionals } from "@/services/booking";
import { DomainError } from "@/services/errors";
import type { Appointment, Customer, Slot } from "@/types";
import { AppointmentDetails } from "./appointment-details";
import { BookingActions } from "./booking-actions";
import { DatePicker } from "./date-picker";
import { SlotPicker } from "./slot-picker";

type Step = 1 | 2 | 3 | 4 | 5;
const STEP_LABELS = ["Serviço", "Profissional", "Data e horário", "Seus dados", "Confirmar"] as const;

interface Contact {
  name: string;
  whatsapp: string;
  email: string;
  birthDate: string;
  notes: string;
}

interface Draft {
  step: Step;
  serviceId: string | null;
  professionalId: string | null; // "any" | id
  date: string | null;
  startsAt: string | null;
  contact: Contact;
}

type Action =
  | { type: "service"; id: string }
  | { type: "professional"; id: string }
  | { type: "date"; date: string }
  | { type: "slot"; startsAt: string }
  | { type: "contact"; patch: Partial<Contact> }
  | { type: "goto"; step: Step };

const emptyContact: Contact = { name: "", whatsapp: "", email: "", birthDate: "", notes: "" };

function reducer(d: Draft, a: Action): Draft {
  switch (a.type) {
    case "service":
      return { ...d, serviceId: a.id, date: null, startsAt: null, step: d.professionalId ? 3 : 2 };
    case "professional":
      return { ...d, professionalId: a.id, date: null, startsAt: null, step: 3 };
    case "date":
      return { ...d, date: a.date, startsAt: null };
    case "slot":
      return { ...d, startsAt: a.startsAt };
    case "contact":
      return { ...d, contact: { ...d.contact, ...a.patch } };
    case "goto":
      return { ...d, step: a.step };
  }
}

function Stepper({ step, onGo, maxReached }: { step: Step; onGo: (s: Step) => void; maxReached: Step }) {
  return (
    <nav aria-label="Etapas do agendamento" className="mb-6 sm:mb-8">
      <div className="sm:hidden">
        <p className="label-caps text-[12px] text-soft">
          <span className="text-accent-hi">
            Etapa {step} de {STEP_LABELS.length}
          </span>{" "}
          · {STEP_LABELS[step - 1]}
        </p>
        <div className="mt-2.5 flex gap-1.5">
          {STEP_LABELS.map((label, i) => {
            const n = (i + 1) as Step;
            const reachable = n <= maxReached && n !== step;
            return (
              <button
                key={label}
                type="button"
                disabled={!reachable}
                onClick={() => onGo(n)}
                aria-label={`Etapa ${n}: ${label}`}
                aria-current={n === step ? "step" : undefined}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  n === step ? "bg-accent" : n < step ? "bg-accent/50" : "bg-edge"
                }`}
              />
            );
          })}
        </div>
      </div>
      <ol className="hidden items-center gap-2 overflow-x-auto pb-1 sm:flex">
        {STEP_LABELS.map((label, i) => {
          const n = (i + 1) as Step;
          const done = n < step;
          const current = n === step;
          const reachable = n <= maxReached && n !== step;
          return (
            <li key={label} className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onGo(n)}
                aria-current={current ? "step" : undefined}
                className={`label-caps flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                  current
                    ? "border-accent bg-accent text-accent-fg"
                    : done
                      ? "border-accent/50 text-accent-hi hover:bg-accent/10"
                      : "border-edge text-soft"
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                    current ? "bg-accent-fg/15" : done ? "bg-accent/20" : "bg-panel-2"
                  }`}
                >
                  {done ? <IconCheck width={12} height={12} /> : n}
                </span>
                <span className={current ? "" : "hidden sm:inline"}>{label}</span>
              </button>
              {n < 5 && <span aria-hidden className="h-px w-3 bg-edge sm:w-6" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function BookingFlow() {
  const state = useAppState();
  const hydrated = useHydrated();
  const search = useSearchParams();
  const toast = useToast();
  const session = useSession();
  const now = useNow();

  const [draft, dispatch] = useReducer(reducer, {
    step: 1,
    serviceId: null,
    professionalId: null,
    date: null,
    startsAt: null,
    contact: emptyContact,
  } satisfies Draft);
  const [maxReached, setMaxReached] = useState<Step>(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<{ appointment: Appointment; customer: Customer; isNew: boolean } | null>(null);
  const startedTracked = useRef(false);
  const prefilled = useRef(false);
  /** Profissional vindo de /barbeiros: aplicado depois que o cliente escolher o serviço. */
  const pendingPro = useRef<string | null>(null);

  const services = useMemo(
    () => state.services.filter((s) => s.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [state.services],
  );
  const service = services.find((s) => s.id === draft.serviceId) ?? null;
  const pros = useMemo(
    () => (service ? eligibleProfessionals(state, service.id) : []),
    [state, service],
  );
  const chosenPros = useMemo(
    () => (draft.professionalId === "any" ? pros : pros.filter((p) => p.id === draft.professionalId)),
    [pros, draft.professionalId],
  );

  // Pré-seleção por URL (?servico=...&profissional=...) — uma única vez, depois da hidratação.
  useEffect(() => {
    if (!hydrated || prefilled.current) return;
    prefilled.current = true;
    const sid = search.get("servico");
    const pid = search.get("profissional");
    if (sid && services.some((s) => s.id === sid)) {
      dispatch({ type: "service", id: sid });
      if (pid && (pid === "any" || state.professionals.some((p) => p.id === pid && p.active))) {
        dispatch({ type: "professional", id: pid });
      }
    } else if (pid && state.professionals.some((p) => p.id === pid && p.active)) {
      pendingPro.current = pid;
    }
  }, [hydrated, search, services, state.professionals]);

  // Preenche dados do cliente logado.
  useEffect(() => {
    if (!hydrated || !session.customerId) return;
    const c = state.customers.find((x) => x.id === session.customerId);
    if (c && !draft.contact.name && !draft.contact.whatsapp) {
      dispatch({
        type: "contact",
        patch: { name: c.name, whatsapp: formatPhoneBR(c.whatsapp), email: c.email ?? "", birthDate: c.birthDate ?? "" },
      });
    }
  }, [hydrated, session.customerId, state.customers, draft.contact.name, draft.contact.whatsapp]);

  // Ajuste durante a renderização (padrão recomendado pelo React): guarda a etapa mais avançada.
  if (draft.step > maxReached) setMaxReached(draft.step);

  function goTo(step: Step) {
    dispatch({ type: "goto", step });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function chooseService(id: string) {
    if (!startedTracked.current) {
      startedTracked.current = true;
      track("start_booking", { origin: "booking_page" });
    }
    const s = services.find((x) => x.id === id);
    track("select_service", { service: s?.name ?? id, origin: "booking_page" });
    dispatch({ type: "service", id });
    const wanted = pendingPro.current;
    if (wanted && !draft.professionalId && eligibleProfessionals(state, id).some((p) => p.id === wanted)) {
      dispatch({ type: "professional", id: wanted });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const ctx = useMemo(() => availabilityContext(state, now), [state, now]);

  const availability = useMemo(
    () =>
      service && chosenPros.length
        ? daysWithAvailability(ctx, service, chosenPros, todayLocal(now), state.settings.bookingWindowDays + 1)
        : {},
    [ctx, service, chosenPros, now, state.settings.bookingWindowDays],
  );

  const slots: Slot[] = useMemo(() => {
    if (!service || !draft.date || !chosenPros.length) return [];
    const all = computeSlots(ctx, draft.date, service, chosenPros);
    return draft.professionalId === "any" ? uniqueStarts(all) : all;
  }, [ctx, service, chosenPros, draft.date, draft.professionalId]);

  const nextFreeDay = useMemo(() => {
    const today = todayLocal(now);
    for (let i = 0; i <= state.settings.bookingWindowDays; i++) {
      const d = addDays(today, i);
      if (availability[d]) return d;
    }
    return null;
  }, [availability, now, state.settings.bookingWindowDays]);

  const selectedPro =
    draft.professionalId && draft.professionalId !== "any"
      ? state.professionals.find((p) => p.id === draft.professionalId) ?? null
      : null;

  // Se o horário escolhido deixou de existir (ex.: outra aba reservou), avisa.
  const slotStillFree = !draft.startsAt || slots.some((s) => s.startsAt === draft.startsAt);
  const price = service && draft.startsAt ? priceFor(service, toLocalParts(draft.startsAt).weekday) : null;
  const priceIsStartingAt = Boolean(service?.priceIsStartingAt && price === service?.priceCents);

  function validateContact(): boolean {
    const e: Record<string, string> = {};
    const c = draft.contact;
    if (c.name.trim().length < 2) e.name = "Informe seu nome.";
    if (!normalizeWhatsApp(c.whatsapp)) e.whatsapp = "WhatsApp inválido. Use DDD + número.";
    if (c.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) e.email = "E-mail inválido.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!service || !draft.professionalId || !draft.startsAt) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const c = draft.contact;
      const r = await api.createBooking({
        serviceId: service.id,
        professionalId: draft.professionalId,
        startsAt: draft.startsAt,
        name: c.name,
        whatsapp: c.whatsapp,
        email: c.email,
        birthDate: c.birthDate,
        notes: c.notes,
        referralCode: readReferralCode(),
      });
      signInCustomer(r.customer.id); // atalho da demonstração (em produção: login por código)
      track("booking_completed", { service: service.name, value: (r.appointment.priceCents ?? 0) / 100 });
      if (r.isNewCustomer) track("customer_registered", { origin: "booking" });
      setDone({ appointment: r.appointment, customer: r.customer, isNew: r.isNewCustomer });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      if (err instanceof DomainError) {
        if (err.code === "VALIDATION" && err.fields) {
          setErrors(err.fields);
          goTo(4);
        } else if (err.code === "SLOT_UNAVAILABLE") {
          toast(err.message, "error");
          dispatch({ type: "slot", startsAt: "" });
          goTo(3);
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError("Não foi possível concluir o agendamento. Tente novamente.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- Tela de confirmação ----------
  if (done) {
    const pro = state.professionals.find((p) => p.id === done.appointment.professionalId) ?? null;
    const confirmed = done.appointment.status === "confirmed";
    return (
      <div className="mx-auto max-w-2xl animate-rise">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-good/50 bg-good/10 text-good">
            <IconCheck width={30} height={30} />
          </span>
          <h1 className="display text-4xl md:text-5xl">
            {confirmed ? "Agendamento confirmado!" : "Solicitação recebida!"}
          </h1>
          <p className="mt-3 text-soft">
            {confirmed
              ? "Te esperamos na barbearia. Guarde as informações abaixo."
              : "A barbearia vai confirmar seu horário em breve."}
          </p>
        </div>

        <AppointmentDetails
          appointment={done.appointment}
          professional={pro}
          address={`${state.business.address.street}, ${state.business.address.neighborhood} — ${state.business.address.city}/${state.business.address.state}`}
        />

        <div className="mt-6">
          <BookingActions appointment={done.appointment} customer={done.customer} professional={pro} />
        </div>

        <div className="mt-8 space-y-3">
          <Notice title="Cancelar ou remarcar">
            Use o link seguro deste agendamento ou a sua conta, até {state.settings.customerChangeLimitHours}h antes do horário.
          </Notice>
          <div className="flex flex-col gap-3 sm:flex-row">
            <LinkButton href={`/agendamento/${done.appointment.manageToken}`} variant="secondary" className="sm:flex-1">
              Gerenciar este agendamento
            </LinkButton>
            <LinkButton href="/minha-conta" className="sm:flex-1">
              Ir para Minha conta
            </LinkButton>
          </div>
          <p className="pt-2 text-center text-xs text-soft">
            Demonstração: nenhuma mensagem foi enviada. Em produção, o lembrete é enviado por WhatsApp/e-mail.
          </p>
        </div>
      </div>
    );
  }

  // ---------- Fluxo ----------
  return (
    <div className="mx-auto max-w-3xl">
      <Stepper step={draft.step} onGo={goTo} maxReached={maxReached} />

      {draft.step === 1 && (
        <section aria-labelledby="s1">
          <h1 id="s1" className="display text-3xl md:text-4xl">Qual serviço você quer?</h1>
          <p className="mt-2 text-soft">Valores e duração conforme publicados pela barbearia.</p>
          <ul className="mt-6 grid gap-2.5">
            {services.map((s) => {
              const weekday = draft.date ? toLocalParts(`${draft.date}T12:00:00-03:00`).weekday : null;
              const p = weekday === null ? s.priceCents : priceFor(s, weekday);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => chooseService(s.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-md border px-4 py-3.5 text-left transition-colors sm:gap-4 sm:px-5 sm:py-4 ${
                      draft.serviceId === s.id ? "border-accent bg-accent/10" : "border-edge bg-panel hover:border-accent"
                    }`}
                  >
                    <span>
                      <span className="display block text-lg leading-tight">{s.name}</span>
                      <span className="label-caps mt-1 block text-[11px] text-soft">{formatDuration(s.durationMinutes)}</span>
                    </span>
                    <span className="display shrink-0 text-right text-[1.05rem] tabular-nums sm:text-lg">
                      {formatPrice(p, s.priceIsStartingAt && p === s.priceCents)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {draft.step === 2 && service && (
        <section aria-labelledby="s2">
          <h1 id="s2" className="display text-3xl md:text-4xl">Com quem?</h1>
          <p className="mt-2 text-soft">
            Para <strong className="text-fg">{service.name}</strong>.
          </p>
          {pros.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                title="Nenhum profissional disponível para este serviço"
                description="Escolha outro serviço ou fale com a barbearia pelo WhatsApp."
                action={<Button onClick={() => goTo(1)}>Escolher outro serviço</Button>}
              />
            </div>
          ) : (
            <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    track("select_professional", { professional: "any" });
                    dispatch({ type: "professional", id: "any" });
                  }}
                  className="h-full w-full rounded-md border border-edge bg-panel px-5 py-4 text-left transition-colors hover:border-accent"
                >
                  <span className="display block text-lg">Qualquer profissional</span>
                  <span className="mt-1 block text-sm text-soft">Mais horários disponíveis. Escolhemos quem estiver livre.</span>
                </button>
              </li>
              {pros.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      track("select_professional", { professional: p.name });
                      dispatch({ type: "professional", id: p.id });
                    }}
                    className="flex h-full w-full items-center gap-4 rounded-md border border-edge bg-panel px-5 py-4 text-left transition-colors hover:border-accent"
                  >
                    {p.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.photoUrl}
                        alt=""
                        width={48}
                        height={48}
                        className="h-12 w-12 shrink-0 rounded-full border border-accent/50 object-cover object-top"
                      />
                    ) : (
                      <span className="display flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-accent/50 bg-wood text-2xl text-accent">
                        {p.name[0]}
                      </span>
                    )}
                    <span>
                      <span className="display block text-lg">{p.name}</span>
                      <span className="label-caps text-[11px] text-soft">
                        {p.externalRating ? `${p.externalRating.value.toFixed(1).replace(".", ",")} · ${p.externalRating.count} avaliações` : "Barbeiro"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-6">
            <Button variant="ghost" onClick={() => goTo(1)}>← Trocar serviço</Button>
          </div>
        </section>
      )}

      {draft.step === 3 && service && draft.professionalId && (
        <section aria-labelledby="s3">
          <h1 id="s3" className="display text-3xl md:text-4xl">Quando?</h1>
          <p className="mt-2 text-soft">
            {service.name} · {selectedPro ? `com ${selectedPro.name}` : "qualquer profissional"} · {formatDuration(service.durationMinutes)}
          </p>

          {Object.values(availability).every((v) => !v) ? (
            <div className="mt-6">
              <EmptyState
                title="Sem horários disponíveis nos próximos dias"
                description="Tente outro profissional ou fale com a barbearia pelo WhatsApp."
                action={<Button onClick={() => goTo(2)}>Trocar profissional</Button>}
              />
            </div>
          ) : (
            <div className="mt-6 grid gap-6 md:grid-cols-[1fr_1fr]">
              <DatePicker
                value={draft.date}
                onChange={(d) => {
                  track("select_date", { date: d });
                  dispatch({ type: "date", date: d });
                }}
                availability={availability}
                windowDays={state.settings.bookingWindowDays}
                now={now}
              />
              <div aria-live="polite">
                {!draft.date ? (
                  <div className="flex h-full min-h-40 flex-col justify-center rounded-md border border-dashed border-edge p-6 text-center text-soft">
                    Escolha uma data para ver os horários livres.
                    {nextFreeDay && (
                      <button
                        type="button"
                        onClick={() => dispatch({ type: "date", date: nextFreeDay })}
                        className="mt-3 text-accent-hi underline underline-offset-4"
                      >
                        Próximo dia com horário: {formatDateLong(nextFreeDay)}
                      </button>
                    )}
                  </div>
                ) : slots.length === 0 ? (
                  <EmptyState
                    title="Sem horários neste dia"
                    description="Escolha outra data no calendário."
                  />
                ) : (
                  <>
                    <p className="display mb-4 text-xl first-letter:uppercase">{formatDateLong(draft.date)}</p>
                    <SlotPicker
                      slots={slots}
                      value={draft.startsAt}
                      onChange={(s) => dispatch({ type: "slot", startsAt: s.startsAt })}
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {!slotStillFree && (
            <div className="mt-5">
              <Notice tone="warn">Esse horário acabou de ser ocupado. Escolha outro.</Notice>
            </div>
          )}

          <div className="sticky bottom-0 z-30 -mx-5 mt-6 flex items-center justify-between gap-3 border-t border-edge bg-bg/95 px-5 py-3 backdrop-blur md:static md:mx-0 md:mt-8 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
            <Button variant="ghost" onClick={() => goTo(2)}>← Voltar</Button>
            <Button disabled={!draft.startsAt || !slotStillFree} onClick={() => goTo(4)}>
              Continuar
            </Button>
          </div>
        </section>
      )}

      {draft.step === 4 && service && (
        <section aria-labelledby="s4">
          <h1 id="s4" className="display text-3xl md:text-4xl">Seus dados</h1>
          <p className="mt-2 text-soft">Sem senha e sem cadastro longo: só o necessário para reservar.</p>
          <form
            className="mt-6 grid gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (validateContact()) goTo(5);
            }}
          >
            <TextField
              label="Nome"
              autoComplete="name"
              value={draft.contact.name}
              error={errors.name}
              onChange={(e) => dispatch({ type: "contact", patch: { name: e.target.value } })}
            />
            <TextField
              label="WhatsApp"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(19) 99999-9999"
              hint="Usado para confirmar e lembrar do seu horário."
              value={draft.contact.whatsapp}
              error={errors.whatsapp}
              onChange={(e) => dispatch({ type: "contact", patch: { whatsapp: e.target.value } })}
              onBlur={(e) => {
                const n = normalizeWhatsApp(e.target.value);
                if (n) dispatch({ type: "contact", patch: { whatsapp: formatPhoneBR(n) } });
              }}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="E-mail"
                type="email"
                optional
                autoComplete="email"
                value={draft.contact.email}
                error={errors.email}
                onChange={(e) => dispatch({ type: "contact", patch: { email: e.target.value } })}
              />
              <TextField
                label="Data de nascimento"
                type="date"
                optional
                autoComplete="bday"
                hint="Para benefícios de aniversário."
                value={draft.contact.birthDate}
                error={errors.birthDate}
                max={todayLocal(now)}
                onChange={(e) => dispatch({ type: "contact", patch: { birthDate: e.target.value } })}
              />
            </div>
            <TextArea
              label="Observação"
              optional
              maxLength={300}
              rows={3}
              value={draft.contact.notes}
              onChange={(e) => dispatch({ type: "contact", patch: { notes: e.target.value } })}
            />
            <div className="mt-2 flex flex-wrap justify-between gap-3">
              <Button variant="ghost" onClick={() => goTo(3)}>← Voltar</Button>
              <Button type="submit">Revisar agendamento</Button>
            </div>
          </form>
        </section>
      )}

      {draft.step === 5 && service && draft.startsAt && draft.professionalId && (
        <section aria-labelledby="s5">
          <h1 id="s5" className="display text-3xl md:text-4xl">Confira e confirme</h1>
          <div className="mt-6">
            <AppointmentDetails
              appointment={{
                serviceName: service.name,
                startsAt: draft.startsAt,
                durationMinutes: service.durationMinutes,
                priceCents: price,
                priceIsStartingAt,
              }}
              professional={selectedPro}
              professionalLabel="Qualquer profissional disponível"
              address={`${state.business.address.street}, ${state.business.address.neighborhood} — ${state.business.address.city}/${state.business.address.state}`}
            />
          </div>
          <dl className="mt-4 rounded-md border border-edge bg-panel px-5 py-4 text-[15px]">
            <div className="flex justify-between gap-4 py-1"><dt className="text-soft">Cliente</dt><dd>{draft.contact.name}</dd></div>
            <div className="flex justify-between gap-4 py-1"><dt className="text-soft">WhatsApp</dt><dd className="tabular-nums">{draft.contact.whatsapp}</dd></div>
            {draft.contact.email && <div className="flex justify-between gap-4 py-1"><dt className="text-soft">E-mail</dt><dd>{draft.contact.email}</dd></div>}
            {draft.contact.notes && <div className="flex justify-between gap-4 py-1"><dt className="text-soft">Observação</dt><dd className="text-right">{draft.contact.notes}</dd></div>}
          </dl>
          {priceIsStartingAt && (
            <p className="mt-3 text-sm text-soft">O valor final pode variar conforme o atendimento.</p>
          )}
          {!slotStillFree && (
            <div className="mt-4">
              <Notice tone="warn">Esse horário acabou de ser ocupado. Volte e escolha outro.</Notice>
            </div>
          )}
          {formError && (
            <div className="mt-4">
              <Notice tone="bad">{formError}</Notice>
            </div>
          )}
          <p className="mt-5 text-xs text-soft">
            Ao confirmar, você concorda com a{" "}
            <Link href="/politica-de-privacidade" className="underline underline-offset-4">Política de privacidade</Link> e os{" "}
            <Link href="/termos" className="underline underline-offset-4">Termos de uso</Link>.
          </p>
          <div className="mt-6 flex flex-wrap justify-between gap-3">
            <Button variant="ghost" onClick={() => goTo(4)} disabled={submitting}>← Voltar</Button>
            <Button size="lg" loading={submitting} disabled={!slotStillFree} onClick={submit}>
              {submitting ? "Confirmando…" : "Confirmar agendamento"}
            </Button>
          </div>
        </section>
      )}

      {!hydrated && <p className="sr-only">Carregando…</p>}
    </div>
  );
}
