import type { Metadata } from "next";
import { ClientsList } from "@/features/admin/clients-list";

export const metadata: Metadata = { title: "Clientes" };

export default function Page() {
  return <ClientsList />;
}
