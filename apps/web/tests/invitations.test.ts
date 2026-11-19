import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { AuditEvent, Institution, Invitation, Membership, Staff } from "@schoolos/db";
import {
  acceptInvitation,
  createInvitation,
  previewInvitation,
  revokeInvitation,
} from "@/server/invitations";
import { getStaffProfile, saveStaffProfile } from "@/server/staff";

let mongo: MongoMemoryServer;
let schoolA: mongoose.Types.ObjectId;
let schoolB: mongoose.Types.ObjectId;
const oid = () => new mongoose.Types.ObjectId();
const actor = (role: string, institutionId = schoolA) => ({ membershipId: oid(), institutionId, role });
const token = (r: { ok: boolean }) => (r as unknown as { token: string }).token;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([Invitation, Membership, Staff].map((m) => m.syncIndexes()));
  schoolA = (await Institution.create({ name: "Darul Ulum", slug: "darul-ulum" }))._id;
  schoolB = (await Institution.create({ name: "Other School", slug: "other-school" }))._id;
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("invitations", () => {
  it("limits roles by inviter and never stores the raw token", async () => {
    expect(await createInvitation({ role: "ADMIN" }, actor("ACADEMIC_COORDINATOR"))).toMatchObject({ ok: false });
    expect(await createInvitation({ role: "TEACHER" }, actor("TEACHER"))).toMatchObject({ ok: false });
    const made = await createInvitation({ role: "TEACHER", inviteeNote: "Maulana Karim" }, actor("ACADEMIC_COORDINATOR"));
    expect(made.ok).toBe(true);
    const stored = JSON.stringify(await Invitation.find({ institutionId: schoolA }).lean());
    expect(stored).not.toContain(token(made));
    const audit = JSON.stringify(await AuditEvent.find({ institutionId: schoolA, action: "INVITATION_CREATED" }).lean());
    expect(audit).not.toContain(token(made));
  });

  it("previews only school name and role; rejects junk tokens", async () => {
    const made = await createInvitation({ role: "TEACHER" }, actor("PRINCIPAL"));
    expect(await previewInvitation(token(made))).toMatchObject({ institutionName: "Darul Ulum", role: "TEACHER" });
    expect(await previewInvitation("nope")).toBeNull();
    expect(await previewInvitation("a".repeat(43))).toBeNull();
  });

  it("joins the inviting school once; a reused link fails", async () => {
    const made = await createInvitation({ role: "TEACHER" }, actor("PRINCIPAL"));
    const joined = await acceptInvitation(token(made), "user_new_teacher");
    expect(joined).toMatchObject({ ok: true, role: "TEACHER", alreadyMember: false });
    expect(await Membership.countDocuments({ institutionId: schoolA, clerkUserId: "user_new_teacher", role: "TEACHER", active: true })).toBe(1);
    expect(await acceptInvitation(token(made), "user_other")).toMatchObject({ ok: false });
    expect(await Membership.countDocuments({ institutionId: schoolA, clerkUserId: "user_other" })).toBe(0);
  });

  it("only one of two simultaneous accepts wins", async () => {
    const made = await createInvitation({ role: "TEACHER" }, actor("PRINCIPAL"));
    const results = await Promise.all([acceptInvitation(token(made), "user_race_1"), acceptInvitation(token(made), "user_race_2")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("rejects expired and revoked links; revoke is tenant-scoped", async () => {
    const expired = await createInvitation({ role: "TEACHER" }, actor("PRINCIPAL"));
    await Invitation.collection.updateMany({ institutionId: schoolA, status: "PENDING" }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await acceptInvitation(token(expired), "user_late")).toMatchObject({ ok: false });

    const live = await createInvitation({ role: "TEACHER" }, actor("PRINCIPAL"));
    const row = (await Invitation.findOne({ institutionId: schoolA, status: "PENDING" }).lean()) as unknown as { _id: unknown };
    expect(await revokeInvitation(String(row._id), actor("PRINCIPAL", schoolB))).toMatchObject({ ok: false });
    expect(await revokeInvitation(String(row._id), actor("PRINCIPAL"))).toEqual({ ok: true });
    expect(await acceptInvitation(token(live), "user_revoked")).toMatchObject({ ok: false });
  });

  it("never changes an existing member's role through a link", async () => {
    await Membership.create({ institutionId: schoolA, clerkUserId: "user_admin", role: "ADMIN", active: true });
    const made = await createInvitation({ role: "TEACHER" }, actor("PRINCIPAL"));
    expect(await acceptInvitation(token(made), "user_admin")).toMatchObject({ ok: true, alreadyMember: true });
    const m = (await Membership.findOne({ institutionId: schoolA, clerkUserId: "user_admin" }).lean()) as unknown as { role: string };
    expect(m.role).toBe("ADMIN");
  });
});

describe("staff profile", () => {
  it("saves a normalized profile for the caller's own membership, once per membership", async () => {
    const me = actor("TEACHER");
    expect(await saveStaffProfile({ fullName: "Abdul Karim", phone: "01712-345678", subjects: "Quran" }, me)).toEqual({ ok: true });
    expect(await saveStaffProfile({ fullName: "Abdul Karim K.", phone: "01712345678" }, me)).toEqual({ ok: true });
    expect(await Staff.countDocuments({ institutionId: schoolA, membershipId: me.membershipId })).toBe(1);
    expect(await getStaffProfile(schoolA, me.membershipId)).toMatchObject({ fullName: "Abdul Karim K.", phone: "+8801712345678" });
    expect(await getStaffProfile(schoolB, me.membershipId)).toBeNull();
    expect(await saveStaffProfile({ fullName: "X", phone: "bad" }, me)).toMatchObject({ ok: false });
  });
});
