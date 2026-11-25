export function PageHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6 sm:mb-7">
      <p className="m-0 mb-2 text-xs font-bold uppercase tracking-[0.12em] text-fg-muted">Administration</p>
      <h1 className="m-0 mb-1.5 text-[clamp(22px,4vw,28px)] font-bold tracking-tight text-fg">{title}</h1>
      <p className="m-0 text-sm text-fg-muted">{description}</p>
    </div>
  );
}
