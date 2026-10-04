import { requireUserId } from "@/lib/session";
import BottomNav from "@/components/BottomNav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUserId();
  return (
    <>
      <main className="mx-auto max-w-md px-4 pt-5 pb-40">{children}</main>
      <BottomNav />
    </>
  );
}
