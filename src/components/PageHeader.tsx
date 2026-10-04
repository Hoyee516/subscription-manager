export default function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3 px-1">
      <div className="min-w-0">
        <h1 className="text-[26px] font-extrabold tracking-tight">{title}</h1>
        {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
      </div>
      {right}
    </header>
  );
}
