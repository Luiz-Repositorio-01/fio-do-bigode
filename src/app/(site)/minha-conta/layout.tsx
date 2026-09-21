import type { Metadata } from "next";
import { AccountShell } from "@/features/account/account-shell";

export const metadata: Metadata = {
  title: "Minha conta",
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: LayoutProps<"/minha-conta">) {
  return <AccountShell>{children}</AccountShell>;
}
