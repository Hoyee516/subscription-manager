import Link from "next/link";
import { requireUserId } from "@/lib/session";
import { fmtDay, todayHK } from "@/lib/dates";
import { money } from "@/lib/billing";
import { CATEGORY, type Category } from "@/lib/schedule";
import { loadStats } from "@/lib/stats";
import PageHeader from "@/components/PageHeader";
import StackedBars, { type Series } from "@/components/stats/StackedBars";
import HBars from "@/components/stats/HBars";
import IndexLines from "@/components/stats/IndexLines";
import PriceBars from "@/components/stats/PriceBars";
import StepLines from "@/components/stats/StepLines";
import YearBars from "@/components/stats/YearBars";
import { Card, SectionLabel } from "@/components/ui";

const TABS = [
  { key: "spending", label: "Spending" },
  { key: "prices", label: "Prices" },
  { key: "mortgage", label: "Mortgage" },
] as const;

const CAT_ORDER: Category[] = ["home", "tax", "insurance", "savings", "utility", "subs"];
const CAT_SERIES: Series[] = CAT_ORDER.map((c) => ({ key: c, label: CATEGORY[c].label, color: CATEGORY[c].color }));
// Validated categorical order for the premium-growth lines.
const LINE_COLORS = ["#E34948", "#2A78D6", "#1BAF7A", "#EDA100", "#4A3AA7", "#E87BA4"];

/** One chart card: a short label, the question it answers, the chart and a note on the data. */
function Question({ label, q, children, why }: { label: string; q: string; children: React.ReactNode; why?: string }) {
  return (
    <Card className="flex flex-col gap-2">
      <SectionLabel>{label}</SectionLabel>
      <p className="text-sm font-extrabold">{q}</p>
      {children}
      {why && <p className="text-xs text-muted">{why}</p>}
    </Card>
  );
}

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const userId = await requireUserId();
  const { t } = await searchParams;
  const tab = TABS.find((x) => x.key === t)?.key ?? "spending";
  const today = todayHK();
  const s = await loadStats(userId, today);

  return (
    <>
      <PageHeader title="Statistics" sub="All figures in HKD" />
      <nav className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Statistics sections">
        {TABS.map((x) => (
          <Link
            key={x.key}
            href={x.key === "spending" ? "/stats" : `/stats?t=${x.key}`}
            aria-current={tab === x.key ? "page" : undefined}
            className={`flex min-h-10 items-center whitespace-nowrap rounded-full border px-3.5 text-[13px] font-bold ${
              tab === x.key ? "border-ink bg-ink text-white" : "border-[#D5D8D1] bg-white text-[#3C4650]"
            }`}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-3">
        {tab === "spending" && (
          <>
            <Question label="Spending by year" q="How much did I actually pay each year?" why="Logged payments, paid utility bills and auto-charged bills, by category.">
              <StackedBars columns={s.byYear} series={CAT_SERIES} />
            </Question>
            <Question label="Last 12 months" q="Which months hit hardest?" why="Actually paid per month; the dashed line is the 12-month average.">
              <StackedBars columns={s.byMonth} series={CAT_SERIES} average />
            </Question>
            <Question label="Biggest bills" q="Where does the money go?" why="Top 8 by yearly cost at today's prices.">
              <HBars
                rows={s.biggest.map((b) => ({
                  key: b.id,
                  name: b.name,
                  value: b.year,
                  color: CATEGORY[b.category].color,
                  href: b.category === "utility" ? `/utilities?u=${b.id}` : `/bills/${b.id}`,
                }))}
              />
            </Question>
            <Question label="By payment method" q="What does each card carry per year?" why="Each bill's current price over a year, plus utility bills paid with the card in the last 12 months.">
              <HBars rows={s.byMethod.map((m) => ({ key: m.id, name: m.name, value: m.year, color: "#0B5D52", href: `/cards/${m.id}` }))} />
            </Question>
          </>
        )}

        {tab === "prices" && (
          <>
          <Question
            label="Premium growth"
            q="How fast are my insurance prices rising?"
            why="Each policy's premium indexed to 100 in its first year, in its own currency, so policies of different sizes compare fairly."
          >
            {s.growth.length ? (
              <IndexLines series={s.growth.slice(0, 6).map((g, k) => ({ key: g.id, name: g.name, color: LINE_COLORS[k], points: g.points }))} />
            ) : (
              <p className="text-sm text-muted">Needs policies with at least 3 years of premiums.</p>
            )}
          </Question>
          <Question
            label="Software & more"
            q="What does each subscription cost a year, and has it gone up?"
            why="Today's price over a year, in HKD. Passes count what was paid in the last 12 months; prepaid plans are spread over their term. A rise since the first price shows in orange. Tap a bill for details."
          >
            {s.subscriptions.length ? <PriceBars rows={s.subscriptions} /> : <p className="text-sm text-muted">No subscriptions yet.</p>}
          </Question>
          <Question label="Telecom" q="Is each contract getting cheaper or dearer?" why="Monthly price of each contract, in HKD. Each step is a new contract.">
            {s.telecom.length ? (
              <StepLines
                today={today}
                series={s.telecom.slice(0, 6).map((t, k) => ({ key: t.id, name: t.name, color: LINE_COLORS[k], steps: t.steps }))}
              />
            ) : (
              <p className="text-sm text-muted">No telecom bills yet.</p>
            )}
          </Question>
          <Question
            label="Tax"
            q="How much salaries tax each year?"
            why="Total bill per year of assessment (1 Apr – 31 Mar), all instalments together. A lighter bar isn't fully paid yet."
          >
            {s.tax.length ? <YearBars rows={s.tax} color={CATEGORY.tax.color} /> : <p className="text-sm text-muted">No tax bills yet.</p>}
          </Question>
          </>
        )}

        {tab === "mortgage" &&
          (s.mortgage && s.mortgage.years.length ? (
            <Question
              label={s.mortgage.name}
              q="How much of my instalments is interest?"
              why="Yearly totals from the Principal / Interest figures in each payment's note."
            >
              {s.mortgage.balance && (
                <p className="text-xs text-muted">
                  Balance <span className="font-bold text-ink">{money(Math.round(s.mortgage.balance.amount))}</span> after {fmtDay(s.mortgage.balance.date)}
                </p>
              )}
              <StackedBars
                columns={s.mortgage.years}
                series={[
                  { key: "principal", label: "Principal", color: "#2A78D6" },
                  { key: "interest", label: "Interest", color: "#EB6834" },
                ]}
              />
            </Question>
          ) : (
            <Card>
              <p className="text-sm text-muted">No mortgage payments with a principal / interest note yet.</p>
            </Card>
          ))}
      </div>
    </>
  );
}
