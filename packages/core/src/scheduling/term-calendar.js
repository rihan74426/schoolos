export const schedulingRules = {
  termDurationDays: 120,
  classPeriodsPerDay: 7,
};

export function buildAcademicCalendar(startDate, termLengthDays = schedulingRules.termDurationDays) {
  return {
    startDate,
    endDate: new Date(new Date(startDate).getTime() + termLengthDays * 24 * 60 * 60 * 1000),
    durationDays: termLengthDays,
  };
}
