import { describe, expect, it } from "vitest";
import {
  attendanceSubmissionSchema,
  summarizeAttendance,
} from "./attendance-workflow.js";

describe("attendance workflow validation", () => {
  it("accepts a unique set of attendance records", () => {
    expect(
      attendanceSubmissionSchema.safeParse({
        sectionId: "section-1",
        date: "2026-11-16",
        records: [
          { studentId: "student-1", status: "PRESENT" },
          { studentId: "student-2", status: "ABSENT" },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects duplicate student records and invalid dates", () => {
    expect(
      attendanceSubmissionSchema.safeParse({
        sectionId: "section-1",
        date: "not-a-date",
        records: [
          { studentId: "student-1", status: "PRESENT" },
          { studentId: "student-1", status: "LATE" },
        ],
      }).success,
    ).toBe(false);
  });

  it("summarizes statuses without changing source records", () => {
    expect(
      summarizeAttendance([
        { studentId: "a", status: "PRESENT" },
        { studentId: "b", status: "ABSENT" },
        { studentId: "c", status: "PRESENT" },
      ]),
    ).toEqual({ PRESENT: 2, LATE: 0, ABSENT: 1, EXCUSED: 0 });
  });

  it("accepts a meaningful correction reason and rejects a too-short reason", () => {
    const submission = {
      sectionId: "section-1",
      date: "2026-11-16",
      records: [{ studentId: "student-1", status: "PRESENT" }],
    };
    expect(
      attendanceSubmissionSchema.safeParse({
        ...submission,
        correctionReason: "Teacher verified the source register",
      }).success,
    ).toBe(true);
    expect(
      attendanceSubmissionSchema.safeParse({
        ...submission,
        correctionReason: "typo",
      }).success,
    ).toBe(false);
  });
});
