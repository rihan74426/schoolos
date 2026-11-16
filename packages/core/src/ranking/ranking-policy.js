export const rankingRules = {
  academicWeight: 0.6,
  attendanceWeight: 0.2,
  conductWeight: 0.2,
};

export function scoreRankEntry(metrics) {
  return (
    (metrics.academic ?? 0) * rankingRules.academicWeight +
    (metrics.attendance ?? 0) * rankingRules.attendanceWeight +
    (metrics.conduct ?? 0) * rankingRules.conductWeight
  );
}
