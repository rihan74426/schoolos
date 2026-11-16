export const rankingRules = {
  academicWeight: 0.6,
  attendanceWeight: 0.2,
  conductWeight: 0.2,
};

export function scoreRankEntry(metrics) {
  const values = ['academic', 'attendance', 'conduct'];
  for (const key of values) {
    const value = metrics[key] ?? 0;
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new RangeError(`${key} must be between 0 and 100`);
    }
  }
  return (
    (metrics.academic ?? 0) * rankingRules.academicWeight +
    (metrics.attendance ?? 0) * rankingRules.attendanceWeight +
    (metrics.conduct ?? 0) * rankingRules.conductWeight
  );
}
