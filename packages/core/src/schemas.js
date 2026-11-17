import { z } from 'zod';

export const studentIdSchema = z.string().min(1);
export const gradeScaleSchema = z.object({
  passMark: z.number().min(0).max(100),
  distinction: z.number().min(0).max(100),
});

export const gradingRuleSchema = z.object({
  subject: z.string(),
  exam: z.string(),
  passMark: z.number().min(0).max(100),
  maxMarks: z.number().min(1),
});

export const attendanceRuleSchema = z.object({
  minimumAttendancePercent: z.number().min(0).max(100),
  allowedAbsences: z.number().min(0),
});

export const feePolicySchema = z.object({
  monthlyFee: z.number().int().min(0),
  lateFee: z.number().int().min(0),
  scholarshipPercent: z.number().min(0).max(100),
});

export const hostelAllocationSchema = z.object({
  roomType: z.enum(['single', 'double', 'triple']),
  capacity: z.number().min(1),
  gender: z.enum(['male', 'female', 'mixed']),
});

export const rankingRuleSchema = z.object({
  weight: z.number().min(0),
  metric: z.enum(['grade', 'attendance', 'conduct', 'discipline']),
});
