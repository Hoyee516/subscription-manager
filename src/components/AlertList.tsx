"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { dismissAlert, restoreAlert } from "@/app/actions/alerts";
import type { AlertKind } from "@/lib/alerts";
import { Pill, type PillTone } from "./ui";

type Item = { key: string; type: AlertKind; title: string; sub: string; pill: string; tone: PillTone; href: string };
type Past = { key: string; title: string; sub: string; pill: string; href: string };

export default function AlertList({ active, dismissed }: { active: Item[]; dismissed: Past[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showPast, setShowPast] = useState(false);
  const shown = active.filter((a) => !hidden.has(a.key));

  const restore = (key: string, msg: string) =>
    start(async () => {
      const r = await restoreAlert(key);
      if (!r.ok) return void toast.error(r.error);
      setHidden((h) => {
        const n = new Set(h);
        n.delete(key);
        return n;
      });
      toast.success(msg);
      router.refresh();
    });

  const dismiss = (a: Item) => {
    setHidden((h) => new Set(h).add(a.key));
    start(async () => {
      const r = await dismissAlert({ key: a.key, type: a.type, title: a.title, sub: a.sub, href: a.href });
      if (!r.ok) {
        setHidden((h) => {
          const n = new Set(h);
          n.delete(a.key);
          return n;
        });
        return void toast.error(r.error);
      }
      toast("Alert dismissed", { action: { label: "Undo", onClick: () => restore(a.key, "Alert restored") }, duration: 6000 });
      router.refresh();
    });
  };

  return (
    <>
      {shown.length === 0 ? (
        <p className="py-2 text-sm text-muted">Nothing needs attention.</p>
      ) : (
        <ul>
          {shown.map((a) => (
            <li key={a.key} className="flex items-start gap-2 border-t border-[#EEEFEA] first:border-t-0">
              <Link href={a.href} className="min-w-0 flex-1 py-2.5">
                <Pill tone={a.tone}>{a.pill}</Pill>
                <span className="mt-1 block text-sm font-bold">{a.title}</span>
                {a.sub && <span className="block text-xs text-muted">{a.sub}</span>}
              </Link>
              <button
                type="button"
                aria-label={`Dismiss: ${a.title}`}
                onClick={() => dismiss(a)}
                className="mt-1.5 flex h-9 w-9 flex-none items-center justify-center rounded-lg text-muted"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {dismissed.length > 0 && (
        <button type="button" onClick={() => setShowPast((s) => !s)} className="py-1.5 text-center text-[13px] font-bold text-brand">
          {showPast ? "Hide dismissed" : `Show dismissed (${dismissed.length})`}
        </button>
      )}
      {showPast && (
        <ul className="opacity-70">
          {dismissed.map((d) => (
            <li key={d.key} className="flex items-start gap-2 border-t border-[#EEEFEA]">
              <Link href={d.href} className="min-w-0 flex-1 py-2.5">
                <Pill>{d.pill}</Pill>
                <span className="mt-1 block text-sm font-bold">{d.title}</span>
                <span className="block text-xs text-muted">{d.sub}</span>
              </Link>
              <button type="button" onClick={() => restore(d.key, "Restored")} className="mt-2 px-1 text-xs font-bold text-brand">
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
