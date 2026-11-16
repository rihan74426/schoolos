import { PageHeading } from '@/components/admin/page-heading';

export default function AttendancePage() {
  return <><PageHeading title="Attendance" description="Daily attendance records and eligibility monitoring." /><section className="panel"><h2>Attendance workspace</h2><p className="muted">Select a class and date to record or review attendance. Attendance policy logic belongs in <code>@schoolos/core</code>.</p></section></>;
}
