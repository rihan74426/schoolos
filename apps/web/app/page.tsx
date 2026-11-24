import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

const features = [
  ["✓", "Attendance", "Tap roster with guardian SMS alerts"],
  ["$", "Fees", "Invoices, receipts, waivers and reversals"],
  ["▤", "Exams", "Marks entry, approval and report cards"],
  ["♙", "Students", "Directory, enrollment and CSV import"],
];

export default function HomePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-4">
      <div className="grid w-full max-w-xl gap-6 rounded-[20px] border border-line bg-surface p-6 shadow-card sm:p-10">
        <div className="grid gap-3">
          <span aria-hidden="true" className="grid size-12 place-items-center rounded-[14px] bg-grad text-xl font-bold text-white">S</span>
          <p className="m-0 text-xs font-bold uppercase tracking-[0.12em] text-fg-muted">School operations</p>
          <h1 className="m-0 text-4xl font-bold tracking-tight text-fg">SchoolOS</h1>
          <p className="m-0 text-base leading-relaxed text-fg-muted">One calm place for attendance, fees, exams and guardian messages. Built for Bangladeshi schools and madrasas.</p>
        </div>
        <ul className="m-0 grid list-none gap-2 p-0 xs:grid-cols-2">
          {features.map(([icon, title, text]) => (
            <li key={title} className="flex gap-3 rounded-card border border-line bg-surface-2 p-3">
              <span aria-hidden="true" className="grid size-9 flex-none place-items-center rounded-full bg-brand-soft text-brand">{icon}</span>
              <span className="grid"><strong className="text-sm text-fg">{title}</strong><small className="text-xs text-fg-muted">{text}</small></span>
            </li>
          ))}
        </ul>
        <Link className={buttonVariants({ size: "default", className: "w-full sm:w-fit" })} href="/admin/dashboard">Open admin portal</Link>
      </div>
    </main>
  );
}
