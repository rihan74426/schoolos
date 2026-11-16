export const schedulingRules = {
  termDurationDays: 120,
  classPeriodsPerDay: 7,
};

function parseDateOnly(value) {
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new TypeError('startDate must be a valid YYYY-MM-DD date');
  }
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new TypeError('startDate must be a valid YYYY-MM-DD date');
  }
  return parsed;
}

export function buildAcademicCalendar(startDate, termLengthDays = schedulingRules.termDurationDays) {
  if (!Number.isSafeInteger(termLengthDays) || termLengthDays < 1) {
    throw new RangeError('termLengthDays must be a positive integer');
  }

  const start = parseDateOnly(startDate);
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + termLengthDays - 1);

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    durationDays: termLengthDays,
  };
}
