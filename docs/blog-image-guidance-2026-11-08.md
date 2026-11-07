# Blog image guidance and QA — 2026-11-08

## Sources and adaptation

- Poster guide: https://subsequent-paw-3ac.notion.site/40dced0d5b0280b8a2c0d50e1fabe690
- Marketing skills guide (public browser access confirmed after asynchronous load): https://tuemarz.notion.site/53-405137c926d581fdb91ded99dfba60c8
- Primary skill source: https://github.com/coreyhaines31/marketingskills/tree/96798cf38736ecdba015a1d2b0521b0c8f8f41dd

The poster guide's reusable principles are source-product fidelity, separating photography from typography, readable name/price grouping, deliberate hierarchy, and source/mobile/output review. Its example's product, brand, price, ivory styling, and 1080×1920 dimensions are not universal defaults. Large type behind a cut-out product is intentionally not automated because this service has no verified foreground mask.

## Implementation

Blog image briefs now include versioned guidance on product identity, reference isolation, whole/detail/context roles, lighting, labels, and manual checks. Article photography remains the default. An optional promotional poster accepts a headline, product name, optional price/brand, and ivory/dark palette. Copy changes clear its confirmation. Approval rejects unconfirmed copy and non-blog poster use. The approved prompt binds exact poster values, preventing a stale approval from covering changed copy.

The model generates photography without added promotional letters; local composition renders the approved Korean text with the bundled NanumGothic font on a 1024×1536 PNG. The image is contained without cropping; a long title reduces the photo area instead of overlapping it. No extra image-model request is required. Collection/composition failures preserve the provider request for safe retry. Next externalizes the native canvas package; existing font tracing includes the font in deployment.

Generated blog assets carry review notes. Operators can compare source and completed images in the briefing interface. Product identity still requires human verification: a prompt cannot guarantee exact generative reproduction. There is no automatic cut-out, background-title overlap, fact verification, or public publishing step.

Policy version changes invalidate old blog-image binding fingerprints: rebrief those plans before generation. Existing video guidance and schemas are unchanged; no database migration is needed.

## Common marketing application

All 53 upstream skills were verified present with SKILL.md under the local Codex skills directory. Installation was pinned to the SHA above through the system skill-installer helper, preserving existing unrelated skills. Project-shared context lives in `.agents/product-marketing.md`, with a routing instruction in AGENTS.md. This is agent-level assistance, not 53 runtime prompts or automatic integrations. No ad account, paid tool, analytics tag, or publishing permission was enabled.

## Validation

- Full TypeScript test suite: 308 passed, 0 failed; production build passed.
- Renderer tests: actual Korean composition, exact source-photo corner preservation, bounded longest copy, both palettes, invalid image/unconfirmed input rejection.
- Workflow tests: approval restrictions, changed-copy prompt binding, damaged-download recovery, one provider submission across retry/idempotency, stored output metadata and review notes.
- Isolated browser QA: photo/poster switching, unconfirmed approval rejection, confirmation reset after price edit, successful approval, 390px and 1440px widths without horizontal overflow.
- Native dependency compilation failure found during browser QA was corrected via serverExternalPackages and verified by rebuild/restarted browser session.
- Synthetic product previews only; no paid production generation, real customer product validation, or real customer data edits were performed.

Local preview files: `output/blog-poster/poster-ivory.png` and `poster-dark.png` (ignored QA artifacts). The separate worktree preserves other sessions' uncommitted work.
