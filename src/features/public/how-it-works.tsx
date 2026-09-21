const STEPS = [
  { n: "01", title: "Escolha o serviço", text: "Corte, barba ou combo. Veja duração e valor antes de decidir." },
  { n: "02", title: "Escolha o profissional", text: "Seu barbeiro de confiança ou qualquer um que esteja livre." },
  { n: "03", title: "Escolha o horário", text: "Só aparecem horários realmente disponíveis, sem choque de agenda." },
  { n: "04", title: "Confirme", text: "Informe nome e WhatsApp. Pronto: horário reservado." },
] as const;

export function HowItWorks() {
  return (
    <ol className="grid gap-px overflow-hidden rounded-md border border-edge bg-edge sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((s) => (
        <li key={s.n} className="bg-panel p-6">
          <span className="display text-4xl text-accent">{s.n}</span>
          <h3 className="display mt-4 text-xl">{s.title}</h3>
          <p className="mt-2 text-[15px] text-soft">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}
