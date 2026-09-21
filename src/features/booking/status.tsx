import { Badge } from "@/components/ui/misc";
import type { AppointmentStatus } from "@/types";

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
};

const TONE: Record<AppointmentStatus, "warn" | "good" | "accent" | "bad" | "neutral"> = {
  pending: "warn",
  confirmed: "good",
  completed: "accent",
  cancelled: "neutral",
  no_show: "bad",
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return <Badge tone={TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}
