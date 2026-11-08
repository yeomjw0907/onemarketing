# Google / Naver social login — 2026-11-08

> Current user decision: expose Kakao and Google only. Naver buttons and pending-review copy are removed, and NAVER_LOGIN_ENABLED is disabled in Production. Earlier approval/activation instructions below are historical; do not reactivate Naver merely because review later passes without a new user request. Referral preservation fixes and validation are documented in `kakao-google-referral-2026-11-08.md`.

## Product behavior

Advertisers and participants can enter registration or sign in using Google and Naver alongside existing Kakao. New advertisers supply the existing business/contact profile without choosing another password. Existing advertisers explicitly authenticate their email/password before linking; a provider email never causes automatic account merging. Participants enter the existing application/approval flow. Existing users and existing Kakao bindings remain compatible.

The participant application entry also offers social registration. Providers are shown only when their server credentials and enable flag are configured. The same approved provider identity can subsequently sign in; a revoked local binding invalidates its participant sessions. Linking a different provider to a participant is allowed after existing ownership verification, while a second identity from the same provider cannot silently replace the first.

## Security and storage

While `NAVER_LOGIN_REVIEW_PENDING=true`, ordinary visitors see the Naver button disabled with an approval-pending explanation. The review entry `/login?providerReview=naver` (or `&providerReview=naver` on signup) permits the reviewer/developer to exercise the UI. This query is a presentation switch, not authentication: Naver still enforces the app's permitted test users until its approval. Set the flag to false and redeploy only after Naver confirms approval.

- Ten-minute random state, SHA-256 server storage, HttpOnly SameSite=Lax browser binding, provider-bound state, atomic one-time consumption, fixed provider endpoints, bounded input, and request timeout.
- Google additionally uses S256 PKCE. Identity comes from the authenticated provider user-info endpoint, never unverified JWT decoding. No refresh token or provider access token is stored.
- Google requests `openid profile`; Naver requests only the default opaque account identifier. User-provided contact information remains separate.
- Existing `kakaoId`, `trustedKakaoId`, purpose names and pending-cookie names are retained for data compatibility. Google/Naver subjects use provider-qualified base64url keys; Kakao numeric IDs retain their original values. New links explicitly record the provider. Internal legacy names do not imply that a Google/Naver identity is a Kakao identity.
- No database migration or new authentication SaaS is introduced. Authentication guidance was consulted; the user specifically requested Google/Naver on the existing system.

## Console configuration

- Google: dedicated `onemarketing-login` project / OneMarketing Web Login client; external audience; service homepage and policy URLs configured. Production audience transition confirmed in the console.
- Naver: dedicated 원마케팅 app, existing service favicon converted to the required logo size, no additional profile permissions, production callback configured. General-user use depends on Naver review approval; key issuance alone does not remove that restriction.
- Both client IDs/secrets and enable flags were saved directly to the existing Vercel project's Production environment as secrets through the logged-in browser. Secret values were not added to source, local example files, or this report.
- Exact callbacks: `https://www.onemarketing.kr/api/auth/google/callback` and `https://www.onemarketing.kr/api/auth/naver/callback`.

## Verification

315 TypeScript tests passed, including seven new provider tests covering state mismatch, cross-provider state substitution, expiry/replay, PKCE submission, subject collision isolation, participant session revocation, existing-account password checks, and provider-response failure. Existing Kakao/participant application and advertiser onboarding tests pass. Production build and typecheck passed.

Isolated browser QA covers advertiser signup entry, participant login, social buttons and mobile overflow. HTTP QA verifies provider authorization hosts, HttpOnly state cookies and cross-origin rejection. Provider branding assets come from the official Google and Naver bundles; attribution is in public/brands/README.md.

Production browser verification completed: real Google consent returned to advertiser social onboarding; real Naver identifier-only consent returned to participant application with an authenticated pending identity. Ordinary production entry guards Naver while the review entry enables it. New-account business/contact submission remains separate from provider consent. An additional signup-method switch was added after this verification exposed a missing escape from pending onboarding. Provider review status must be reported separately from code deployment. No unrelated worktree changes are included.

## Final production and review status

- Deployed code commit: `89a26f96758a146749e891542748d0c6aad5e9d3`, production deployment `dpl_DpvnnzwpWaNhT2uresjnzkq1zzRP` READY on www.onemarketing.kr.
- Real Google advertiser authentication completed and returned to social onboarding. Real Naver authentication completed for both participant and advertiser entry. The production signup-method switch was exercised successfully.
- Isolated browser registration completed all 11 required profile steps and created the test advertiser/customer/session without a new password. This used a synthetic pending identity fixture and synthetic contact details in the disposable schema, distinct from the real production provider-authentication checks.
- Naver console displayed `검수요청`, final request date `2026.11.08`, with a 7-page / 915,055-byte PDF attached. The PDF explicitly separates production provider-consent/return screens from isolated synthetic registration screens and masks the unrelated personal profile header.
- Review evidence: ignored `output/pdf/onemarketing-naver-login-review.pdf`; confirmation screenshots: `output/social-naver-review-submitted.png` and `output/social-production-final.png`.
- General Naver access remains approval-dependent. Keep NAVER_LOGIN_REVIEW_PENDING true until the console confirms approval, then set it false and redeploy. Key issuance and review submission are not approval.

## Primary references

- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/openid-connect/openid-connect
- https://developers.google.com/identity/branding-guidelines
- https://developers.naver.com/docs/login/api/api.md
- https://developers.naver.com/docs/login/profile/profile.md
- https://developers.naver.com/docs/login/bi/bi.md
