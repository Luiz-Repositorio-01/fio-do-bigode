import type { Metadata } from "next";
import { Section } from "@/components/site/section";
import { ManageAppointment } from "@/features/booking/manage-appointment";

// Link privado (token secreto): nunca indexar.
export const metadata: Metadata = {
  title: "Seu agendamento",
  robots: { index: false, follow: false },
};

export default async function ManagePage({ params }: PageProps<"/agendamento/[token]">) {
  const { token } = await params;
  return (
    <Section className="!py-10 md:!py-16">
      <ManageAppointment token={token} />
    </Section>
  );
}
