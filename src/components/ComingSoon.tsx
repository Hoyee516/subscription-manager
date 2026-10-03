export default function ComingSoon({ phase }: { phase: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#C9CEC6] bg-white p-6 text-center text-sm text-muted">
      Built in {phase}.
    </div>
  );
}
