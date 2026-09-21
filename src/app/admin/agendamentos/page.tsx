import type { Metadata } from "next";
import { AppointmentsList } from "@/features/admin/appointments-list";

export const metadata: Metadata = { title: "Agendamentos" };

export default function Page() {
  return <AppointmentsList />;
}
