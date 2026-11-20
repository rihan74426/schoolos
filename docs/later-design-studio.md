# Later: Design Studio (posters, images, sheets, video)

Status: idea, NOT in first release. Leaders (principal, coordinators) create and edit posters, images, sheets and short videos inside SchoolOS.

## Phases (build in order, stop when value is enough)
1. **Template generators (cheapest, highest value).** Fixed templates filled from institution data (logo, colors, name, Bangla/Arabic fonts): notice poster, admission banner, result card, admit card, ID card, certificate. Server render HTML/SVG -> PNG/PDF. No editor yet.
2. **Canvas editor.** Browser editor on a canvas lib (Fabric.js / Konva, or tldraw). Design saved as JSON in a tenant-scoped `Design` model (`institutionId`, `kind`, `json`, `version`, `createdBy`). Assets in object storage (R2/S3/Cloudinary), keyed by institution. Lazy-load the editor; phone gets a reduced toolset.
3. **Sheets.** Export existing data (attendance, fees, marks) to .xlsx; later an editable grid. Data stays in Mongo, sheet is a view.
4. **Video (CapCut-like).** Heavy. Prefer a render API (Shotstack/Creatomate) or Remotion/ffmpeg over building a timeline editor. Last.
5. **AI assist.** Text via LLM (notice wording, Bangla/English), image generation via provider API. Optional layer on phases 1-2.

## Build vs buy (verify current terms before deciding)
- Embed SDKs: Polotno, IMG.LY CE.SDK, Adobe Express embed, Canva Connect/Apps. Faster, but cost/licensing and data leaving our tenant boundary. Confirm which APIs are available to us and at what plan.
- Own canvas: more control, RTL/Bangla font work is ours.

## Rules / risks
- New permission (e.g. `studio:use`) in `permissionMatrix`; no inline role lists.
- Designs are tenant data: every query scoped by `institutionId`; no cross-school template leaks (shared presets are read-only globals).
- PDPA: no student photos or names sent to third-party AI/render services without guardian consent and legal review.
- Fonts: Bangla + Arabic embedded; RTL via logical properties.
- Copyright: user-uploaded logos/images are the school's responsibility; add terms.
- Storage/cost caps per institution.
