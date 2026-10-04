import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireUserId } from "@/lib/session";
import { addDays, addMonths, todayHK } from "@/lib/dates";
import { money } from "@/lib/billing";
import { CATEGORY, loadData, occurrences, summary, type Category, type Occurrence } from "@/lib/schedule";
import PageHeader from "@/components/PageHeader";
import { Card, Pill, SectionLabel } from "@/components/ui";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ym = (d: Date) => d.toISOString().slice(0, 7);
const r0 = (n: number) => Math.round(n);
const amountText = (o: Occurrence) => (o.amount != null ? `${o.estimate ? "≈" : ""}${money(r0(o.amount))}` : "");

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string; d?: string; v?: string }> }) {
  const userId = await requireUserId();
  const { m, d, v } = await searchParams;
  const today = todayHK();
  const month = /^\d{4}-\d{2}$/.test(m ?? "") ? new Date(`${m}-01T00:00:00Z`) : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const monthEnd = addDays(addMonths(month, 1), -1);
  const list = v === "list";

  const data = await loadData(userId);
  const occ = occurrences(data, month, monthEnd, today);
  const charges = occ.filter((o) => o.kind === "charge");
  const total = charges.reduce((s, o) => s + (o.amount ?? 0), 0);
  const paid = charges.filter((o) => o.paid).reduce((s, o) => s + (o.amount ?? 0), 0);
  const toGo = charges.filter((o) => !o.paid).length;
  const avg = summary(data, today).mrc;

  const byDay = new Map<number, Occurrence[]>();
  for (const o of occ) byDay.set(o.date.getUTCDate(), [...(byDay.get(o.date.getUTCDate()) ?? []), o]);

  const isThisMonth = ym(month) === ym(today);
  const sel = Number(d) >= 1 && Number(d) <= monthEnd.getUTCDate() ? Number(d) : isThisMonth ? today.getUTCDate() : (byDay.keys().next().value ?? 1);
  const selDate = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), sel));
  const lead = (month.getUTCDay() + 6) % 7; // Monday first
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: monthEnd.getUTCDate() }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const q = (p: Record<string, string | number | undefined>) =>
    "/calendar?" + Object.entries({ m: ym(month), v: list ? "list" : undefined, ...p }).filter(([, x]) => x !== undefined).map(([k, x]) => `${k}=${x}`).join("&");

  const Row = ({ o }: { o: Occurrence }) => (
    <li className="border-t border-[#EEEFEA] first:border-t-0">
      <Link href={o.href} className="flex items-start gap-3 py-2.5">
        <span className="mt-1 h-2.5 w-2.5 flex-none rounded-full" style={{ background: CATEGORY[o.category].color }} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">{o.name}</span>
          <span className="block text-xs text-muted">{o.sub}</span>
          {(o.paid || o.kind === "ends") && (
            <span className="mt-1.5 flex gap-1.5">{o.paid ? <Pill tone="teal">Paid</Pill> : <Pill tone="grey">Ends</Pill>}</span>
          )}
        </span>
        <span className="text-sm font-bold">{amountText(o)}</span>
      </Link>
    </li>
  );

  return (
    <>
      <div className="flex items-start justify-between">
        <PageHeader title="Calendar" sub={`Bill hit dates · ${MONTHS[month.getUTCMonth()]} ${month.getUTCFullYear()}`} />
        <div className="flex rounded-[10px] bg-[#E7E9E3] p-[3px]">
          {[
            ["Month", false],
            ["List", true],
          ].map(([label, isList]) => (
            <Link
              key={String(label)}
              href={isList ? q({ v: "list", d: undefined }) : q({ v: undefined })}
              className={`flex min-h-9 items-center rounded-lg px-3.5 text-[13px] font-bold ${list === isList ? "bg-white text-ink" : "text-muted"}`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Card className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <SectionLabel>{MONTHS[month.getUTCMonth()]} commitments</SectionLabel>
            <span className="text-sm font-bold">{money(r0(total))}</span>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-md bg-[#ECEDE8]">
            <div className="bg-brand" style={{ width: `${total ? Math.min(100, (paid / total) * 100) : 0}%` }} />
          </div>
          <div className="flex justify-between text-xs text-muted">
            <span>
              Paid {money(r0(paid))} · {toGo} {toGo === 1 ? "bill" : "bills"} to go
            </span>
            <span>avg month {money(r0(avg))}</span>
          </div>
        </Card>

        <Card className="flex flex-col gap-1.5">
          <div className="mb-1 flex items-center justify-between">
            <Link href={`/calendar?m=${ym(addMonths(month, -1))}${list ? "&v=list" : ""}`} aria-label="Previous month" className="flex h-11 w-11 items-center justify-center rounded-xl border border-line">
              <ChevronLeft size={20} />
            </Link>
            <span className="text-base font-bold">
              {MONTHS[month.getUTCMonth()]} {month.getUTCFullYear()}
            </span>
            <Link href={`/calendar?m=${ym(addMonths(month, 1))}${list ? "&v=list" : ""}`} aria-label="Next month" className="flex h-11 w-11 items-center justify-center rounded-xl border border-line">
              <ChevronRight size={20} />
            </Link>
          </div>

          {list ? (
            occ.length === 0 ? (
              <p className="py-3 text-sm text-muted">Nothing due this month.</p>
            ) : (
              <ul>
                {[...byDay.entries()].map(([day, os]) => (
                  <li key={day} className="border-t border-[#EEEFEA] pt-2 first:border-t-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                      {WEEKDAY[new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day)).getUTCDay()]} {day}
                    </p>
                    <ul>
                      {os.map((o) => (
                        <Row key={o.key} o={o} />
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <>
              <div className="grid grid-cols-7 gap-0.5">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => (
                  <div key={w} className="py-1 text-center text-[11px] font-bold text-[#6B7480]">
                    {w}
                  </div>
                ))}
                {cells.map((day, i) => {
                  if (!day) return <div key={i} />;
                  const os = byDay.get(day) ?? [];
                  const cats = [...new Set(os.map((o) => o.category))] as Category[];
                  const isToday = isThisMonth && day === today.getUTCDate();
                  const isSel = day === sel;
                  return (
                    <Link
                      key={i}
                      href={q({ d: day })}
                      aria-label={`${day} ${MONTHS[month.getUTCMonth()]}${os.length ? `, ${os.length} due` : ""}`}
                      className={`flex h-[46px] flex-col items-center justify-center gap-1 rounded-[10px] text-sm font-semibold ${
                        isSel ? "bg-panel text-white" : isToday ? "border-2 border-ink" : ""
                      }`}
                    >
                      {day}
                      <span className="flex h-1.5 gap-[3px]">
                        {cats.slice(0, 3).map((c) => (
                          <span key={c} className="h-1.5 w-1.5 rounded-full" style={{ background: CATEGORY[c].color }} />
                        ))}
                      </span>
                    </Link>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-3.5 gap-y-1 pt-1.5 text-xs text-muted">
                {(["subs", "insurance", "home", "utility", "savings"] as Category[]).map((c) => (
                  <span key={c} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY[c].color }} />
                    {CATEGORY[c].label}
                  </span>
                ))}
              </div>
            </>
          )}
        </Card>

        {!list && (
          <Card className="flex flex-col gap-1">
            <SectionLabel>
              {WEEKDAY[selDate.getUTCDay()]} {sel} {MONTHS[month.getUTCMonth()]}
            </SectionLabel>
            {(byDay.get(sel) ?? []).length === 0 ? (
              <p className="py-2 text-sm text-muted">Nothing due on this day.</p>
            ) : (
              <ul>
                {(byDay.get(sel) ?? []).map((o) => (
                  <Row key={o.key} o={o} />
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
