import { PageHeading } from '@/components/admin/page-heading';

export default function CommunicationsPage() {
  return <><PageHeading title="Notices" description="Prepare institution and class announcements with clear review and delivery status." /><section className="panel"><span className="badge">Foundation planned</span><h2>Notice workspace</h2><p className="muted">Notices will be drafted, reviewed, targeted to an authorized audience, and sent through queued provider adapters. Delivery failures and retries will remain visible.</p><p className="small muted">No messages are sent from this preview.</p></section></>;
}
