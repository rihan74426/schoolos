export const attendanceRules = {
  minimumAttendancePercent: 75,
  maxExcusedAbsenceDays: 10,
};

export function isAttendanceEligible(attendancePercent) {
  return attendancePercent >= attendanceRules.minimumAttendancePercent;
}
