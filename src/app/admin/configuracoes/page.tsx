import type { Metadata } from "next";
import { SettingsAdmin } from "@/features/admin/settings-admin";

export const metadata: Metadata = { title: "Configurações" };

export default function Page() {
  return <SettingsAdmin />;
}
