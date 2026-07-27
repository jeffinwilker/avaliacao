import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";
import { redirect } from "next/navigation";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar userEmail={user.email ?? null} />
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
