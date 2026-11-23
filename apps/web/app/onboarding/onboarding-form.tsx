"use client";

import { useActionState } from "react";
import { createFirstInstitutionAction } from "./actions";

export function OnboardingForm() {
  const [state, formAction] = useActionState(createFirstInstitutionAction, null);

  return (
    <form action={formAction} className="onboarding-form">
      <label htmlFor="institution-name">Institution name</label>
      <input
        id="institution-name"
        name="name"
        required
        minLength={2}
        maxLength={120}
      />
      <label htmlFor="institution-locale">Default language</label>
      <select id="institution-locale" name="locale" defaultValue="en">
        <option value="en">English</option>
        <option value="bn">বাংলা</option>
        <option value="ar">العربية</option>
      </select>
      <label htmlFor="institution-preset">Starting rules</label>
      <select id="institution-preset" name="preset" defaultValue="bd-school">
        <option value="bd-school">School (GPA 5.0, no hostel)</option>
        <option value="bd-madrasa">Madrasa (divisions, hostel on)</option>
      </select>
      <p className="form-hint">
        These are starting templates. You can change grading, attendance, fee
        and hostel rules in Settings.
      </p>
      {state?.error ? (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      ) : null}
      <button className="button-link" type="submit">
        Create institution
      </button>
    </form>
  );
}
