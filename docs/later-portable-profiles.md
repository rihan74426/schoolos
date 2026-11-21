# Later: Portable profiles (teacher passport, learner record, discovery)

Status: PLAN, not in first release. Do not build before fees/exams and the PDPA legal review.

## Vision
One person, one profile, many schools. A teacher who changes institution keeps their history; a learner who transfers keeps their record. Everyone is assigned to a school; unassigned people can be recommended schools they chose.

## Core rule: who owns what
| Data | Owner | Travels? |
|---|---|---|
| Attendance, marks, fees, discipline, internal notes | Institution (tenant) | NO. Stays at that school. Never auto-shared. |
| Employment history (role, subjects, start/end) | Institution issues, person sees | Summary only, institution-verified |
| Endorsements, reviews, stars | Issued BY an institution, about a person | Shown on profile, labelled with the issuing school |
| Portfolio (lessons, certificates, publications) | Person | Yes, person controls visibility |
| Learner transcript / certificate | Institution issues, guardian/learner holds | Only via consented transfer or share link |

## Data model (new, additive)
- `PlatformProfile` (GLOBAL, no `institutionId`): `clerkUserId` (unique), `kind` (TEACHER|LEARNER), `displayName`, `visibility`, `openToWork`, `preferences`. Needs an explicit `allowGlobal` flag in `tenantPlugin`, plus its own test file.
- `Membership` / `Staff` / `Student` / `Guardian` gain `profileId` (nullable). Existing tenant data is untouched.
- `Employment` (tenant): `profileId`, `role`, `subjects`, `startsOn`, `endsOn`, `status`. Leaving sets `endsOn`; NEVER deletes records.
- `Endorsement` (tenant, issued): `profileId`, `issuedByMembershipId`, `rating` (1-5), `text`, `status` (PENDING|PUBLISHED|WITHDRAWN), audit trail.
- `PortfolioItem` (global, owned by profile): `kind`, `title`, `fileRef`, `visibility`.
- `TransferRequest` (cross-tenant): from school, to school, `profileId`, guardian consent ref, `expiresAt`, `status`. Releases a signed summary snapshot, not live access.

## Rules
1. Institution data stays tenant-scoped. Cross-school reads happen ONLY through published snapshots (Endorsement, Employment summary, TransferRequest snapshot), never by querying another tenant.
2. Learners are minors: no public profile, no public ratings, no leaderboards. Transfers need guardian consent (PDPA children's consent). Default visibility = private.
3. Teachers are adults: public profile is opt-in. Reviews come only from institution leaders (verified issuer), with right of reply and a withdraw/dispute flow. No anonymous public stars.
4. Contact/recommendation (unassigned people): only with explicit opt-in (`openToWork` for teachers; guardian opt-in for learners). Never contact minors directly; contact the guardian.
5. Leaving a school: membership `active:false`, `endsOn` set, records retained per that school's retention policy. Person keeps portfolio and endorsements.
6. Every cross-tenant event writes an AuditEvent in BOTH schools.
7. Local counsel review (PDPA 2026, children's data, cross-border, defamation risk for reviews) before launch.

## Phases (stop when value is enough)
1. **Foundation (cheap, do early):** add `endsOn`/`status` to Membership and Staff; keep Clerk user as the person key. No new UI.
2. **Teacher passport:** PlatformProfile, Employment, Endorsement, Portfolio, profile page, "join another school" via invite keeps the same profile.
3. **Learner transfer:** TransferRequest with guardian consent; receiving school sees a snapshot and creates its own Student record.
4. **Discovery:** school profiles, job-seeker opt-in, recommendations, platform-mediated contact. This is a second product (marketplace); validate demand first.

## Risks
- Breaks tenant isolation if done carelessly: global collections bypass `tenantPlugin`. Add isolation tests before any global model.
- Review abuse / defamation: verified issuers only, dispute flow, moderation.
- Child safety and consent are the hardest part; keep learners private by default.
- Marketplace needs supply on both sides; do not build discovery before the school product has real users.
- Duplicate people (same teacher, two Clerk accounts): add a verified-phone merge flow later.

## Decisions needed from the founder
1. Who may issue stars: school leaders only, or also verified colleagues/guardians?
2. Public teacher profile pages indexed by search engines, or visible only inside the platform?
3. Learner record: transfer-only, or may a learner hold a private lifetime portfolio?