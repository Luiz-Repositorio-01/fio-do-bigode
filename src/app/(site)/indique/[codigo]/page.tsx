import type { Metadata } from "next";
import { Section } from "@/components/site/section";
import { ReferralLanding } from "@/features/public/referral-landing";

export const metadata: Metadata = {
  title: "Convite",
  robots: { index: false, follow: false },
};

export default async function Page(props: PageProps<"/indique/[codigo]">) {
  const { codigo } = await props.params;
  return (
    <Section>
      <ReferralLanding code={decodeURIComponent(codigo).slice(0, 20)} />
    </Section>
  );
}
