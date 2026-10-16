# Legal policy review — 2026-09-16

The website policy sources are `src/lib/content/privacy-policy.md` (v4.0) and
`src/lib/content/terms-of-use.md` (v3.0). The external deletion resource is
`src/routes/delete-account/+page.svelte`. The effective date is set to this review
date; coordinate it with the actual publication and required user notice.

This review compares the local SAPO mobile/backend source with current official
guidance. It is not a certification of worldwide compliance. Production deployment
state, provider dashboards, contracts, historical practices, and the jurisdictions
in which the business actually offers services were not verified.

The published MPR database now uses Turso with a libSQL schema. The website
queries it through read-only server endpoints, independently of the mobile app's
authentication and cloud-processing backend reviewed below. This database
migration does not change the mobile backend's processing or retention behavior.

## Publication blockers and implementation follow-up

1. **Apple Standard EULA and business details:** The owner chose Apple's Standard
   EULA for App Store app licenses. The Terms link to it and apply as supplemental
   service terms; they are not a custom App Store EULA. In App Store Connect,
   verify App Information > License Agreement uses the standard agreement in all
   intended territories; remove any previously configured custom agreement.
   This website edit does not change the store configuration. The custom-EULA
   contact clause is therefore no longer the reason to require an address/phone
   in these Terms. Separate trader, consumer, and privacy contact obligations
   still need to be met. The owner reports an official NJ mailing address but
   has not supplied the exact address for publication, and has no U.S. telephone
   number; a contact number need not be U.S.-based. Confirm the company's details
   match the store business information.
2. **Third-party AI permission:** The cloud request path in
   `components/home/TranslateButton.tsx` and `stores/translationStore.ts` checks
   authentication and subscription access, but no explicit AI-sharing permission
   step was found. Apple guideline 5.1.2(i) requires clear disclosure and explicit
   permission before sharing personal data with third-party AI. Add an in-app
   explanation of data and recipients before the first cloud submission, an
   affirmative choice, and appropriate withdrawal/version handling. Cover both
   translation (SAPO backend/Cloudflare) and respelling (SAPO backend/Cloudflare/OpenAI),
   including repeat requests. A link to these policies is not a substitute.
3. **AI logs, caches, and training settings:** Confirm Cloudflare AI Gateway
   payload logging, caching, automatic deletion, and existing log contents.
   The backend module `model/sapopinguino/cloudflareAi.ts` sets OpenAI `store: false` but does
   not set a gateway logging opt-out header. Cloudflare documents payload logging
   enabled by default; storage-capacity cleanup is not a time-based retention
   guarantee. Disable unnecessary content persistence or establish and disclose
   a justified concrete retention schedule. Confirm OpenAI data-sharing opt-ins,
   abuse-monitoring controls, and model-specific caching. Do not claim zero
   retention based on `store: false`. The policy currently explains these
   limitations rather than claiming unverified dashboard settings. The owner
   reports opting out of provider retention/training where possible, but is
   unsure of Cloudflare's behavior. The Privacy Policy now states the policy of
   opting out of training/unrelated uses and disabling optional content retention
   wherever controls are available. Verify the deployed settings implement that
   commitment; it is not evidence of zero retention or a provider audit.
4. **Transfers, officers, and target markets:** The owner intends worldwide
   distribution, has no appointed privacy officer or regional representative,
   and believes the mobile backend is hosted in the United States; the region is unverified.
   Document actual hosting/processing
   countries, processor agreements, subprocessors, transfer mechanisms and
   assessments. Determine whether EEA/UK representatives, a DPO, Brazilian
   encarregado, or other local contact/registration is required and publish their
   verified details. Assess country-specific consent, children's rules,
   localization, language, and cross-border requirements (including markets such
   as India, China, and South Korea) before distribution there. General rights
   language does not satisfy those separate obligations or prove applicability.
5. **Retention and rights operations:** Establish approved schedules for ordinary
   usage/account records, legacy anonymous records, support mail, infrastructure
   logs, provider copies, and backups where the code has no fixed expiry. Verify
   cleanup jobs run in production, failed deletions are resolved, and retained
   exceptions are necessary. Staff the email deletion/access/correction/export
   and appeal routes, meet applicable deadlines, and document identity
   verification. Test deletion without app access and with active subscriptions.
6. **Store disclosures and consumer terms:** Update App Store privacy labels and
   Google Play Data safety answers for all actual SDK/provider behavior. Account
   identifiers, email/name, purchase information, usage, diagnostics, and cloud
   user content need classification using each store's definitions; do not claim
   ephemeral processing while gateway/provider copies persist. Local-only text
   should be distinguished from content transmitted off-device. Register
   `https://sapo.surf/delete-account` as the external deletion URL. Verify actual
   offers, quota overrides, paywall renewal/trial notices, cancellation/restore
   behavior, privacy manifests, release permissions, and child-age handling.
7. **Historical disclosures and legal review:** Verify the complete preceding
   12-month collection/disclosure/sale history for applicable U.S. state notices;
   the two source snapshots are not a complete operational history. Obtain
   jurisdiction-specific review of consumer remedies, liability provisions,
   legal bases, sensitive text, and consent procedures. Provide required material
   change notices before the revised documents take effect.

## Source evidence

Paths below are relative to `~/development/react-native/SAPO`. References marked
**backend** are relative to its backend submodule, whose path is configured in
that repository's `.gitmodules`.

| Finding                                                                                                                                                          | Source                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud sign-in required; local translation available signed out; respelling requires subscription                                                                 | `components/home/TranslateButton.tsx`, `providers/AuthGate.tsx`, backend `betterAuth/model/auth.ts`                                                                                    |
| Cloud translation uses Workers AI; respelling uses OpenAI Responses through Cloudflare AI Gateway, with `store: false`                                           | backend `model/sapopinguino/cloudflareAi.ts`                                                                                                                                           |
| Local request returns before cloud path; no automatic cloud fallback                                                                                             | `stores/translationStore.ts`, `lib/local-translation.native.ts`                                                                                                                        |
| Hugging Face model downloads; model/partial/verification files in cache; available-storage check                                                                 | `constants/localModelCatalog.ts`, `lib/local-model.native.ts`                                                                                                                          |
| Secure user ID/email and subscription snapshots; web auth uses browser storage                                                                                   | `lib/confirmed-user-cache.ts`, `lib/confirmed-subscription-cache.ts`, `lib/secure-storage.ts`, `lib/auth-client.ts`                                                                    |
| Free cloud: 500/request, 5,000/month translation, no respelling; Polyglot: 10,000/request, 500,000/month translation and 2,000/request, 100,000/month respelling | backend `constants/subscriptions.ts`, `constants/subscription.ts`                                                                                                                      |
| Local input limit: 2,000 characters                                                                                                                              | `constants/localModels.ts`, `utils/inputLimits.ts`                                                                                                                                     |
| Account/usage/subscription records, no translation-history table; frozen quota retains store IDs after removing user ID                                          | backend `subscriptions/schema.ts`, backend `subscriptions/model/webhook.ts`                                                                                                            |
| Frozen quota cleanup cutoff is 60 days after period end, not after deletion                                                                                      | backend `constants/subscriptions.ts`, backend `subscriptions/model/webhook.ts`                                                                                                         |
| Terminal webhook cleanup: 90 days from update; resolved alerts: 90 days from resolution; daily scheduled cleanup                                                 | backend `model/subscriptions/workers.ts`, backend `model/operationalAlerts.ts`, backend `crons.ts`                                                                                     |
| Email component retains finalized records one week and abandoned records four weeks; operational emails can include identifiers                                  | backend `email.ts`, backend `model/email.ts`, backend `model/operationalAlerts.ts`, backend `CONFIGURATION.md`                                                                         |
| Email-confirmed deletion and provider cleanup                                                                                                                    | `components/account/DeleteAccountScreen.tsx`, `components/settings/data-controls/DataControlsScreen.tsx`, backend `betterAuth/model/auth.ts`, backend `model/subscriptions/workers.ts` |
| App legal links point to this website; mobile repository has an older standalone policy                                                                          | `constants/legal.ts`, `PrivacyPolicy.md`                                                                                                                                               |

The mobile repository's standalone `PrivacyPolicy.md` is dated 2026-05-11 and
describes older practices. Synchronize it with the published policy or replace it
with a canonical link as part of the mobile release so it is not reused as the
current notice.

## Official references consulted

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), especially 3.1.2 and 5.1.1–5.1.2.
- [Apple minimum custom-EULA terms](https://www.apple.com/legal/internet-services/itunes/dev/minterms/).
- [Google Play User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en), including disclosure, privacy policy, and in-app/external deletion requirements.
- [ICO: right to be informed](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-be-informed/).
- [California Attorney General: CCPA](https://oag.ca.gov/privacy/ccpa).
- [ANPD: data subject rights](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares).
- [Cloudflare AI Gateway logging](https://developers.cloudflare.com/ai-gateway/observability/logging/).
- [OpenAI API data controls](https://platform.openai.com/docs/guides/your-data).
