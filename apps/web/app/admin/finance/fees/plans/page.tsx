import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { can, formatMinor } from "@schoolos/core";
import { connectDb } from "@schoolos/db";
import { ActionForm } from "@/components/admin/action-form";
import { PageHeading } from "@/components/admin/page-heading";
import { resolveActiveMembership } from "@/server/auth";
import { listFeePlans } from "@/server/invoices";
import { createFeePlanAction, generateInvoicesAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const actor = await resolveActiveMembership();
  await connectDb();
  const heading = <PageHeading title="Fee plans" description="Define what each class pays, then generate invoices." />;
  if (!can(actor.role, "fees:read")) return <>{heading}<Card className="mb-4"><p className="muted">Your role cannot view fees.</p></Card></>;
  const { plans, years, levels } = await listFeePlans(actor);
  const canPlan = can(actor.role, "fees:configure");
  const canBill = can(actor.role, "fees:write");
  return (
    <>
      {heading}
      <Card className="mb-4">
        <h2>Plans</h2>
        {plans.length ? plans.map((p) => (
          <div key={p.id} className="list-row">
            <strong>{p.name}</strong> <span className="muted">{p.year} · {p.level} · {formatMinor(p.totalMinor)}</span>
            <ul>{p.lines.map((l) => <li key={l.title}>{l.title}: {formatMinor(l.amountMinor)}</li>)}</ul>
          </div>
        )) : <p className="empty-state">No fee plans yet.</p>}
      </Card>
      {canPlan ? (
        <Card className="mb-4">
          <h2>New plan</h2>
          <ActionForm action={createFeePlanAction} submitLabel="Create plan">
            <label>Name<Input name="name" required maxLength={60} placeholder="Class 6 monthly" /></label>
            <label>Academic year<Select name="academicYearId" required>{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</Select></label>
            <label>Class<Select name="gradeLevelId"><option value="">All classes</option>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></label>
            <label>Fee lines (one per line, like Title: taka)<Textarea name="lines" rows={4} required placeholder={"Tuition: 1500\nExam fee: 250"} /></label>
          </ActionForm>
        </Card>
      ) : null}
      {canBill && plans.length ? (
        <Card className="mb-4">
          <h2>Generate invoices</h2>
          <p className="muted">Creates one invoice per active student placed in the plan academic year (and class, if set). Running it again for the same month skips students who already have one.</p>
          <ActionForm action={generateInvoicesAction} submitLabel="Generate">
            <label>Plan<Select name="planId" required>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></label>
            <label>Billing month<Input name="period" type="month" required /></label>
            <label>Due date<Input name="dueDate" type="date" required /></label>
          </ActionForm>
        </Card>
      ) : null}
    </>
  );
}
