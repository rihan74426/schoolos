export function PageHeading({ title, description }: { title: string; description: string }) {
  return <div className="page-heading"><div><p className="eyebrow">ADMINISTRATION</p><h1>{title}</h1><p className="muted">{description}</p></div></div>;
}
