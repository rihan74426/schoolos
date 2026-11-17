import { afterEach, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Student } from "../models/Student.js";

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
  await Student.deleteMany({ institutionId: { $in: [schoolA, schoolB] } });
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
});
