import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { buildInitialPolicy } from "@schoolos/core";
import { AuditEvent, GradingScheme, InstitutionPolicy } from "@schoolos/db";
import { updateFeePolicy } from "@/server/fees";
import { getInstitutionPolicy } from "@/server/policy";

let mongo: MongoMemoryServer;
const oid = () => new mongoose.Types.ObjectId();
const school = oid();
const other = oid();
const as = (institutionId = school, role = "PRINCIPAL") => ({ membershipId: oid(), institutionId, role });
const flat = { currency: "BDT", lateFee: { mode: "FLAT", flatMinor: 10000, graceDays: 3 }, scholarshipCapPercent: 30 };

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([InstitutionPolicy, GradingScheme, AuditEvent].map((m) => m.syncIndexes()));
  for (const id of [school, other]) {
    const policy = buildInitialPolicy("bd-school");
    await GradingScheme.create({ institutionId: id, key: policy.gradingSchemeKey, name: "GPA", status: "ACTIVE", passPercent: 33, bands: [{ label: "A", minPercent: 0, gradePoint: 5 }] });
    await InstitutionPolicy.create({ institutionId: id, policy, version: 1 });
  }
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("updateFeePolicy", () => {
  it("defaults to no late fee, then lets a principal set a flat fee with a before/after audit", async () => {
    expect((await getInstitutionPolicy(school))?.policy).toMatchObject({ fees: { lateFee: { mode: "NONE" } } });
    expect(await updateFeePolicy(flat, 1, as())).toEqual({ ok: true, version: 2 });
    expect((await getInstitutionPolicy(school))?.policy).toMatchObject({ fees: { lateFee: { mode: "FLAT", flatMinor: 10000, graceDays: 3 }, scholarshipCapPercent: 30 } });
    const audit = (await AuditEvent.findOne({ institutionId: school, action: "POLICY_UPDATED" }).lean()) as unknown as { metadata: { before: { fees: { lateFee: { mode: string } } }; after: { fees: { lateFee: { mode: string } } } } };
    expect(audit.metadata.before.fees.lateFee.mode).toBe("NONE");
    expect(audit.metadata.after.fees.lateFee.mode).toBe("FLAT");
  });

  it("keeps every other policy section untouched", async () => {
    const policy = (await getInstitutionPolicy(school))?.policy as { attendance: unknown; gradingSchemeKey: string };
    expect(policy.attendance).toEqual(buildInitialPolicy("bd-school").attendance);
  });

  it("rejects a stale version and invalid rules", async () => {
    expect(await updateFeePolicy(flat, 1, as())).toMatchObject({ ok: false, error: "Policy changed elsewhere. Reload and retry." });
    expect(await updateFeePolicy({ ...flat, lateFee: { mode: "PERCENT_PER_DAY", percent: 500 } }, 2, as())).toMatchObject({ ok: false });
    expect(await updateFeePolicy({ ...flat, lateFee: { mode: "FLAT", flatMinor: 1.5 } }, 2, as())).toMatchObject({ ok: false });
    expect((await getInstitutionPolicy(school))?.version).toBe(2);
  });

  it("never touches another school", async () => {
    expect((await getInstitutionPolicy(other))?.policy).toMatchObject({ fees: { lateFee: { mode: "NONE" } } });
    expect((await getInstitutionPolicy(other))?.version).toBe(1);
  });
});
