import type { Metadata } from "next";
import { AdminShell } from "@/features/admin/admin-shell";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: { default: "Painel", template: "%s · Painel Fio do Bigode" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="admin-shell min-h-dvh">
      <ToastProvider>
        <AdminShell>{children}</AdminShell>
      </ToastProvider>
    </div>
  );
}
