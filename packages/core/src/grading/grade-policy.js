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

export function computeGrade(marks, passMark = gradingRules.defaultPassMark, bands = gradingRules.gradeBands) {
  if (!Number.isFinite(marks) || marks < 0 || marks > gradingRules.maxGrade) {
    throw new RangeError(`marks must be between 0 and ${gradingRules.maxGrade}`);
  }
  if (!Number.isFinite(passMark) || passMark < 0 || passMark > gradingRules.maxGrade) {
    throw new RangeError('passMark must be between 0 and maxGrade');
  }
  for (const band of ['a', 'b', 'c']) {
    if (!Number.isFinite(bands?.[band]) || bands[band] < 0 || bands[band] > gradingRules.maxGrade) {
      throw new RangeError(`grade band ${band} must be between 0 and maxGrade`);
    }
  }
  if (!(bands.a >= bands.b && bands.b >= bands.c)) {
    throw new RangeError('grade bands must be in descending order');
  }

  if (marks < passMark) return 'F';
  if (marks >= bands.a) return 'A';
  if (marks >= bands.b) return 'B';
  if (marks >= bands.c) return 'C';
  return 'D';
}
