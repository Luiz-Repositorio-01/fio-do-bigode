import type { Metadata } from "next";
import { Suspense } from "react";
import { Section } from "@/components/site/section";
import { Skeleton } from "@/components/ui/misc";
import { BookingFlow } from "@/features/booking/booking-flow";

export const metadata: Metadata = {
  title: "Agendar horário",
  description: "Agende seu horário no Fio do Bigode, em Piracicaba: escolha serviço, profissional, data e horário.",
  alternates: { canonical: "/agendar" },
};

export default function BookingPage() {
  return (
    <Section className="!py-10 md:!py-16">
      <Suspense
        fallback={
          <div className="mx-auto max-w-3xl space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        }
      >
        <BookingFlow />
      </Suspense>
    </Section>
  );
}
