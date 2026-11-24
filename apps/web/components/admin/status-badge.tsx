import { Badge } from "@/components/ui/badge";

const TONES: Record<string, "brand" | "ok" | "warn" | "err" | "muted"> = {
  DRAFT: "muted", ENTRY: "brand", SUBMITTED: "warn", APPROVED: "ok", PUBLISHED: "ok",
  PASS: "ok", FAIL: "err",
};

export function StatusBadge({ status, children }: { status: string; children?: React.ReactNode }) {
  return <Badge tone={TONES[status.toUpperCase()] ?? "brand"}>{children ?? status.toLowerCase()}</Badge>;
}
