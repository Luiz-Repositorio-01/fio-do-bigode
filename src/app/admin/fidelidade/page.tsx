import type { Metadata } from "next";
import { LoyaltyAdmin } from "@/features/admin/loyalty-admin";

export const metadata: Metadata = { title: "Fidelidade" };

export default function Page() {
  return <LoyaltyAdmin />;
}
