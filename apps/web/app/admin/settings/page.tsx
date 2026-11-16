import { PageHeading } from '@/components/admin/page-heading';

export default function SettingsPage() {
  return <><PageHeading title="Settings" description="School profile, academic configuration, and staff access." /><section className="panel"><h2>School settings</h2><p className="muted">Add tenant configuration and role-based access controls before exposing administrative actions.</p></section></>;
}
