"use client";

import { Notice } from "@/components/ui/misc";
import { useAppState } from "@/lib/store/store";

type Block = { h: string; p: string[] };

/**
 * Texto-base (modelo). A barbearia deve revisá-lo com assessoria jurídica antes
 * de publicar em produção — por isso o aviso no topo enquanto o site é demonstração.
 */
export function LegalDoc({ kind }: { kind: "privacy" | "terms" }) {
  const { business, settings } = useAppState();
  const contact = `WhatsApp ${business.whatsappDisplay}`;

  const privacy: Block[] = [
    {
      h: "1. Quem somos",
      p: [
        `${business.name} Barbearia (“barbearia”) é a responsável pelo tratamento dos dados pessoais coletados neste site, com sede em ${business.address.street}, ${business.address.neighborhood}, ${business.address.city}/${business.address.state}. Contato sobre privacidade: ${contact}.`,
      ],
    },
    {
      h: "2. Quais dados coletamos",
      p: [
        "Nome e WhatsApp (necessários para agendar); e-mail e data de nascimento (opcionais); observações que você escrever ao agendar; histórico de agendamentos, valores e pontos do programa de fidelidade.",
        "Podemos usar cookies e ferramentas de estatística apenas se configuradas pela barbearia (ex.: Google Analytics e Meta Pixel), para medir o uso do site.",
      ],
    },
    {
      h: "3. Para que usamos",
      p: [
        "Realizar e gerenciar seu agendamento; entrar em contato sobre o horário; manter seu histórico e o programa de fidelidade; enviar felicitações e comunicações de relacionamento, quando você permitir; e cumprir obrigações legais.",
      ],
    },
    {
      h: "4. Com quem compartilhamos",
      p: [
        "Não vendemos seus dados. Eles podem ser tratados por prestadores que hospedam o sistema e o banco de dados, sob contrato e apenas para operar o serviço. O contato por WhatsApp é feito por meio do próprio aplicativo, sujeito à política do WhatsApp.",
      ],
    },
    {
      h: "5. Seus direitos (LGPD)",
      p: [
        `Você pode solicitar confirmação de tratamento, acesso, correção, anonimização, portabilidade, eliminação dos dados e revogação de consentimento pelo ${contact}. Dados de agendamento podem ser mantidos pelo prazo necessário a obrigações legais e à defesa de direitos.`,
      ],
    },
    {
      h: "6. Segurança",
      p: [
        "Adotamos medidas técnicas para proteger seus dados, como controle de acesso por perfil, isolamento entre clientes e comunicação criptografada.",
      ],
    },
  ];

  const terms: Block[] = [
    {
      h: "1. Agendamento online",
      p: [
        "O horário só é considerado reservado após a mensagem “Agendamento confirmado”. Os valores exibidos são os praticados pela barbearia; serviços marcados com “a partir de” podem ter o valor final ajustado conforme o atendimento.",
      ],
    },
    {
      h: "2. Cancelamento e remarcação",
      p: [
        `Você pode cancelar ou remarcar pelo próprio site até ${settings.customerChangeLimitHours}h antes do horário. Depois disso, fale com a barbearia pelo ${contact}. Faltas recorrentes sem aviso podem limitar novos agendamentos online.`,
      ],
    },
    {
      h: "3. Atrasos",
      p: ["O atendimento é com horário agendado e pontual. Atrasos podem exigir reduzir o serviço ou remarcar, conforme a agenda do dia."],
    },
    {
      h: "4. Programa de fidelidade",
      p: [
        "Pontos, níveis e recompensas seguem as regras vigentes divulgadas na página de fidelidade e podem ser alterados pela barbearia. Pontos não têm valor em dinheiro, são pessoais e intransferíveis, e podem ter prazo de validade quando configurado.",
      ],
    },
    {
      h: "5. Uso do site",
      p: ["Informe dados verdadeiros. Reservas abusivas ou em nome de terceiros sem autorização podem ser canceladas."],
    },
  ];

  const blocks = kind === "privacy" ? privacy : terms;
  return (
    <article className="mx-auto max-w-3xl">
      <Notice tone="warn" title="Texto-base em revisão">
        Modelo redigido para esta versão de demonstração. Deve ser revisado pela barbearia com apoio jurídico
        antes da publicação definitiva.
      </Notice>
      <div className="mt-10 space-y-9">
        {blocks.map((b) => (
          <section key={b.h}>
            <h2 className="display text-2xl">{b.h}</h2>
            {b.p.map((t) => (
              <p key={t} className="mt-3 text-soft">
                {t}
              </p>
            ))}
          </section>
        ))}
      </div>
    </article>
  );
}
