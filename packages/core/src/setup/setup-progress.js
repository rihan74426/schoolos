// Pure: turns record counts into the dashboard setup checklist.
export const setupStepDefs = [
  { key: 'academic-year', title: 'Create the academic year', description: 'Set dates and mark the current session.', href: '/admin/settings#years' },
  { key: 'structure', title: 'Add grades and sections', description: 'Create the class structure for the session.', href: '/admin/settings#classes' },
  { key: 'students', title: 'Add students and guardians', description: 'Import or create student records.', href: '/admin/students' },
  { key: 'attendance', title: 'Start attendance', description: 'Record a class register and review exceptions.', href: '/admin/academics/attendance' },
];

export function setupProgress(counts) {
  const done = {
    'academic-year': (counts.currentYears ?? 0) > 0,
    structure: (counts.gradeLevels ?? 0) > 0 && (counts.sections ?? 0) > 0,
    students: (counts.students ?? 0) > 0,
    attendance: (counts.attendanceSessions ?? 0) > 0,
  };
  const steps = setupStepDefs.map((step) => ({ ...step, done: done[step.key] }));
  const completed = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done) ?? null;
  return { steps, completed, total: steps.length, next };
}
