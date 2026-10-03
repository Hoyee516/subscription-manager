export default function PageHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="mb-4 px-1">
      <h1 className="text-[26px] font-extrabold tracking-tight">{title}</h1>
      {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
    </header>
  );
}
