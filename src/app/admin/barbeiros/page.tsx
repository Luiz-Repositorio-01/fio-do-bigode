import type { Metadata } from "next";
import { ProfessionalsAdmin } from "@/features/admin/professionals-admin";

export const metadata: Metadata = { title: "Barbeiros" };

export default function Page() {
  return <ProfessionalsAdmin />;
}
