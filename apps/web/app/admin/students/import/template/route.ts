import { IMPORT_TEMPLATE } from "@schoolos/core";

export const dynamic = "force-dynamic";

export function GET() {
  return new Response(IMPORT_TEMPLATE, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="students-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
