# Kakao / Google signup and referral verification — 2026-11-08

## User-visible change

Social entry buttons now show Kakao and Google only across advertiser signup/login, participant login, and participant application. Naver buttons and review-pending copy are absent even when the backend inventory reports Naver enabled. The Production NAVER_LOGIN_ENABLED flag is also disabled; stored credentials and past identity records are retained. Do not automatically activate Naver after approval: the user has superseded that request.

## Referral defect and fix

The existing application reads `ref` from its URL, but OAuth callbacks previously reconstructed the application URL without it. A referred visitor who chose social signup could therefore lose attribution.

Kakao and Google entry requests now pass the referral context. The server stores it on the provider-bound, expiring OAuth attempt and verified pending identity. The callback reconstructs the signup URL with the stored code; the pending-onboarding redirect preserves it too. Application submission uses the pending identity's recorded referral when present, so missing or changed form context cannot silently drop the original attribution. Existing application validation still rejects invalid or self-referral codes. Oversized values are discarded and query values are encoded rather than used as redirect destinations.

An already-linked participant signs into the existing account and does not change its referrer or create another signup credit by following a different referral link.

## Verified business behavior

Provider-specific integration tests exercise mocked Kakao/Google token and user-info responses against an isolated database, then real application, session, referral and settlement logic:

- referral survives state consumption, pending onboarding, and callback URL creation;
- new participant and application retain the correct referrer;
- repeated submission creates exactly one signup referral credit;
- self-referral is rejected;
- logout invalidates the old session, and re-login restores the same participant without changing attribution;
- signup credit remains pending until first qualifying campaign payment;
- campaign/referral sync is idempotent; referral settlement cannot be paid twice;
- reversal after payout marks recovery required.

The current signup credit is 2,000 KRW, initially pending_campaign. This is eligibility/ledger verification in disposable test data, not an actual bank transfer. Advertiser social onboarding uses the existing business-profile flow; these referral rewards concern participant recruitment, not a newly invented advertiser referral program.

Focused regression suite: 33 passed; full suite: 318 passed, 0 failures. Typecheck and final production build passed. Browser QA checked the three entry surfaces at desktop and 390px widths, with no Naver buttons or horizontal overflow. Production-browser results are recorded in the completion report. No real customer registrations or reward transfers are created by the automated tests.
