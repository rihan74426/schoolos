import { PageHeading } from "@/components/admin/page-heading";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

/** Honest placeholder for modules that are not built yet, so nobody mistakes them for broken pages. */
export function ComingSoon({ title, description, summary, note }: { title: string; description: string; summary: string; note?: string }) {
  return (
    <>
      <PageHeading title={title} description={description} />
      <Card className="grid max-w-xl gap-3">
        <Badge tone="muted" className="w-fit">Coming soon</Badge>
        <p className="m-0 text-sm text-fg-muted">{summary}</p>
        {note ? <p className="m-0 text-xs text-fg-muted">{note}</p> : null}
      </Card>
    </>
  );
}
