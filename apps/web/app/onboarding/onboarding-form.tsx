"use client";

import { useFormState } from "react-dom";
import { createFirstInstitutionAction } from "./actions";

export function OnboardingForm() {
  const [state, formAction] = useFormState(createFirstInstitutionAction, null);

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
