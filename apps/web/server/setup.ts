import "server-only";
import { setupProgress } from "@schoolos/core";
import { AcademicYear, AttendanceSession, GradeLevel, Section, Student } from "@schoolos/db";

export async function getSetupProgress(institutionId: unknown) {
  const [currentYears, gradeLevels, sections, students, attendanceSessions] = await Promise.all([
    AcademicYear.countDocuments({ institutionId, isCurrent: true }),
    GradeLevel.countDocuments({ institutionId }),
    Section.countDocuments({ institutionId, status: "ACTIVE" }),
    Student.countDocuments({ institutionId, status: "ACTIVE" }),
    AttendanceSession.countDocuments({ institutionId, status: "ACTIVE" }),
  ]);
  return setupProgress({ currentYears, gradeLevels, sections, students, attendanceSessions });
}
