import type { Metadata } from "next";
import { RewardsAdmin } from "@/features/admin/rewards-admin";

export const metadata: Metadata = { title: "Recompensas" };

export default function Page() {
  return <RewardsAdmin />;
}
