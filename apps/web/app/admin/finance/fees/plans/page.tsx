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
  if (!can(actor.role, "fees:read")) return <>{heading}<section className="panel"><p className="muted">Your role cannot view fees.</p></section></>;
  const { plans, years, levels } = await listFeePlans(actor);
  const canPlan = can(actor.role, "fees:configure");
  const canBill = can(actor.role, "fees:write");
  return (
    <>
      {heading}
      <section className="panel">
        <h2>Plans</h2>
        {plans.length ? plans.map((p) => (
          <div key={p.id} className="list-row">
            <strong>{p.name}</strong> <span className="muted">{p.year} · {p.level} · {formatMinor(p.totalMinor)}</span>
            <ul>{p.lines.map((l) => <li key={l.title}>{l.title}: {formatMinor(l.amountMinor)}</li>)}</ul>
          </div>
        )) : <p className="empty-state">No fee plans yet.</p>}
      </section>
      {canPlan ? (
        <section className="panel">
          <h2>New plan</h2>
          <ActionForm action={createFeePlanAction} submitLabel="Create plan">
            <label>Name<input name="name" required maxLength={60} placeholder="Class 6 monthly" /></label>
            <label>Academic year<select name="academicYearId" required>{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></label>
            <label>Class<select name="gradeLevelId"><option value="">All classes</option>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            <label>Fee lines (one per line, like Title: taka)<textarea name="lines" rows={4} required placeholder={"Tuition: 1500\nExam fee: 250"} /></label>
          </ActionForm>
        </section>
      ) : null}
      {canBill && plans.length ? (
        <section className="panel">
          <h2>Generate invoices</h2>
          <p className="muted">Creates one invoice per active student placed in the plan academic year (and class, if set). Running it again for the same month skips students who already have one.</p>
          <ActionForm action={generateInvoicesAction} submitLabel="Generate">
            <label>Plan<select name="planId" required>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>Billing month<input name="period" type="month" required /></label>
            <label>Due date<input name="dueDate" type="date" required /></label>
          </ActionForm>
        </section>
      ) : null}
    </>
  );
}
