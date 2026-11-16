import { PageHeading } from '@/components/admin/page-heading';

export default function HostelPage() {
  return <><PageHeading title="Hostel" description="Room capacity, student allocation, and residence operations." /><section className="panel"><h2>Hostel workspace</h2><p className="muted">Room assignment and capacity rules should be validated by <code>@schoolos/core</code>.</p></section></>;
}
