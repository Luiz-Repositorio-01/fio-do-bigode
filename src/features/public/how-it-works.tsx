const STEPS = [
  { n: "01", title: "Escolha o serviço", text: "Corte, barba ou combo. Veja duração e valor antes de decidir." },
  { n: "02", title: "Escolha o profissional", text: "Seu barbeiro de confiança ou qualquer um que esteja livre." },
  { n: "03", title: "Escolha o horário", text: "Só aparecem horários realmente disponíveis, sem choque de agenda." },
  { n: "04", title: "Confirme", text: "Informe nome e WhatsApp. Pronto: horário reservado." },
] as const;

export function HowItWorks() {
  return (
    <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-edge bg-edge lg:grid-cols-4">
      {STEPS.map((s) => (
        <li key={s.n} className="bg-panel p-4 sm:p-6">
          <span className="display text-3xl text-accent sm:text-4xl">{s.n}</span>
          <h3 className="display mt-2 text-[1.05rem] leading-snug sm:mt-4 sm:text-xl">{s.title}</h3>
          <p className="mt-1.5 text-[13.5px] leading-snug text-soft sm:mt-2 sm:text-[15px]">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}
