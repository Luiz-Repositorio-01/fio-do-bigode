import type { Metadata } from "next";
import { AgendaView } from "@/features/admin/agenda";

export const metadata: Metadata = { title: "Agenda" };

export default function Page() {
  return <AgendaView />;
}
