export const gradingRules = {
  defaultPassMark: 40,
  maxGrade: 100,
  gradeBands: {
    a: 80,
    b: 65,
    c: 50,
    d: 40,
  },
};

export function computeGrade(marks, passMark = gradingRules.defaultPassMark) {
  if (marks < passMark) return 'F';
  if (marks >= 80) return 'A';
  if (marks >= 65) return 'B';
  if (marks >= 50) return 'C';
  return 'D';
}
