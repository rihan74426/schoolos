"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createFirstInstitutionAction } from "./actions";

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(createFirstInstitutionAction, null);

  return (
    <form action={formAction} className="mt-6 grid gap-4">
      <label htmlFor="institution-name" className="grid gap-1 text-sm font-medium text-fg">
        Institution name
        <Input id="institution-name" name="name" required minLength={2} maxLength={120} />
      </label>
      <label htmlFor="institution-locale" className="grid gap-1 text-sm font-medium text-fg">
        Default language
        <Select id="institution-locale" name="locale" defaultValue="en">
          <option value="en">English</option>
          <option value="bn">বাংলা</option>
          <option value="ar">العربية</option>
        </Select>
      </label>
      <label htmlFor="institution-preset" className="grid gap-1 text-sm font-medium text-fg">
        Starting rules
        <Select id="institution-preset" name="preset" defaultValue="bd-school">
          <option value="bd-school">School (GPA 5.0, no hostel)</option>
          <option value="bd-madrasa">Madrasa (divisions, hostel on)</option>
        </Select>
      </label>
      <p className="m-0 text-xs text-fg-muted">These are starting templates. You can change grading, attendance, fee and hostel rules in Settings.</p>
      {state?.error ? <p role="alert" className="m-0 rounded-[10px] bg-[color-mix(in_srgb,var(--err)_12%,transparent)] px-3 py-2 text-sm text-err">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Creating…" : "Create institution"}</Button>
    </form>
  );
}
