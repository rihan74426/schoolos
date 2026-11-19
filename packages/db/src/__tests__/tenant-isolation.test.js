import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Student } from "../models/Student.js";
import { Enrollment } from "../models/Enrollment.js";
import { AuditEvent } from "../models/AuditEvent.js";
import { Invitation } from "../models/Invitation.js";

let mongo;
let schoolA;
let schoolB;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Student.syncIndexes();
  schoolA = new mongoose.Types.ObjectId();
  schoolB = new mongoose.Types.ObjectId();
});

afterEach(async () => {
  await Student.deleteMany({ institutionId: schoolA });
  await Student.deleteMany({ institutionId: schoolB });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("tenant-scoped student model", () => {
  it("does not return another institution’s student from a scoped query", async () => {
    await Student.create([
      {
        institutionId: schoolA,
        studentNumber: "001",
        firstName: "A",
        lastName: "Student",
      },
      {
        institutionId: schoolB,
        studentNumber: "001",
        firstName: "B",
        lastName: "Student",
      },
    ]);

    const result = await Student.find({ institutionId: schoolA }).lean();
    expect(result).toHaveLength(1);
    expect(result[0].firstName).toBe("A");
  });

  it("rejects unscoped reads and updates", async () => {
    await expect(Student.find({ studentNumber: "001" })).rejects.toThrow(
      "Tenant scope required: find",
    );
    await expect(
      Student.updateOne(
        { studentNumber: "001" },
        { $set: { firstName: "Changed" } },
      ),
    ).rejects.toThrow("Tenant scope required: updateOne");
  });

  it("allows same student number in separate institutions and scopes updates", async () => {
    const [a, b] = await Student.create([
      {
        institutionId: schoolA,
        studentNumber: "shared",
        firstName: "A",
        lastName: "Student",
      },
      {
        institutionId: schoolB,
        studentNumber: "shared",
        firstName: "B",
        lastName: "Student",
      },
    ]);

    await Student.updateOne(
      { _id: a._id, institutionId: schoolA },
      { $set: { firstName: "Updated A" } },
    );
    expect(
      (await Student.findOne({ _id: b._id, institutionId: schoolB }).lean())
        ?.firstName,
    ).toBe("B");
  });

  it("requires tenant scope on enrollments and applies the audit tenant field", async () => {
    await expect(
      Enrollment.find({ studentId: new mongoose.Types.ObjectId() }),
    ).rejects.toThrow("Tenant scope required: find");
    expect(AuditEvent.schema.path("institutionId")).toBeDefined();
  });

  it("rejects operator objects as the tenant scope", async () => {
    await expect(
      Student.find({ institutionId: { $ne: schoolA } }),
    ).rejects.toThrow("Invalid tenant scope: find");
    await expect(
      Student.deleteMany({ institutionId: { $in: [schoolA, schoolB] } }),
    ).rejects.toThrow("Invalid tenant scope: deleteMany");
    await expect(
      Student.find({ institutionId: String(schoolA) }),
    ).resolves.toEqual([]);
  });

  it("allows invitation lookup only by a full SHA-256 token hash", async () => {
    const hash = "a".repeat(64);
    await expect(Invitation.findOne({ tokenHash: hash })).resolves.toBeNull();
    await expect(Invitation.find({})).rejects.toThrow("Tenant scope required: find");
    await expect(Invitation.findOne({ tokenHash: "short" })).rejects.toThrow("Tenant scope required");
    await expect(Invitation.findOne({ tokenHash: { $ne: hash } })).rejects.toThrow("Tenant scope required");
    await expect(Invitation.deleteMany({ tokenHash: hash })).rejects.toThrow("Tenant scope required");
  });
});
