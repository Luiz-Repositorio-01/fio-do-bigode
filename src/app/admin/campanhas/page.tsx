import type { Metadata } from "next";
import { CampaignsAdmin } from "@/features/admin/campaigns-admin";

export const metadata: Metadata = { title: "Campanhas" };

export default function Page() {
  return <CampaignsAdmin />;
}
