import type { Metadata } from "next";
import { ClientProfile } from "@/features/admin/client-profile";

export const metadata: Metadata = { title: "Cliente" };

export default async function Page(props: PageProps<"/admin/clientes/[id]">) {
  const { id } = await props.params;
  return <ClientProfile id={id} />;
}
