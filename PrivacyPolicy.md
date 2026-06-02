# SAPO Privacy Policy

**Effective Date:** 2026-05-11

This Privacy Policy explains how SAPO collects, uses, stores, shares, and protects personal data when you use the SAPO mobile app, related backend services, authentication flows, AI-powered translation and respelling features, subscriptions, and account/data controls.

This Policy is intended to support global privacy requirements, including the GDPR, UK GDPR, Swiss FADP, LGPD, PIPEDA, POPIA, CCPA/CPRA and other U.S. state privacy laws, and app store privacy disclosure requirements. Only the laws that apply to you based on your location and circumstances apply to your use of SAPO.

SAPO is operated by the app publisher shown in the applicable app store listing. For privacy questions or requests, contact **support@sapo.surf**. If that address is unavailable, contact **juanmarzabala8a@gmail.com**.

---

## 1. Summary

- SAPO offers optional Google or Apple sign-in for account features and does not create accounts in the background.
- SAPO sends text you submit, plus selected source and target language labels, to our backend and to OpenAI's API to generate translation or respelling output.
- SAPO uses Convex-hosted backend services, Better Auth authentication software, OpenAI, RevenueCat, Apple, Google, and Resend to provide the app.
- SAPO offers paid subscriptions through Apple App Store and Google Play, managed through RevenueCat.
- SAPO does not sell personal data, share personal data for targeted advertising, serve ads, or use third-party analytics SDKs in the current codebase.
- SAPO does not request camera, microphone, contacts, photo library, precise location, health, fitness, or advertising tracking permissions in the current app configuration.
- Signed-in users can request account deletion in the app. Deleting your SAPO account does not cancel Apple or Google store billing.

---

## 2. Scope

This Policy applies to SAPO's mobile app and backend endpoints, including:

- Google and Apple account sign-in.
- Translation and respelling requests.
- Usage metering, quota enforcement, and stream stop controls.
- Subscriptions, purchase restore, subscription refresh, and account deletion workflows.
- Support or privacy requests you send to us.

This Policy does not cover third-party websites, app stores, identity providers, or payment systems when they process data under their own terms and privacy policies.

---

## 3. Personal Data We Collect Or Process

| Category | Examples | Source | Required Or Optional |
|---|---|---|---|
| Account and authentication data | SAPO user ID, name, email address, email verification status, optional profile image, sign-in provider account ID, account creation/update timestamps | You, Apple, Google, Better Auth software running on our backend | Optional; required only for account features |
| Session and security data | Session tokens, Convex auth tokens, session expiration, IP address, user agent, verification tokens, OAuth access/refresh/ID tokens where provided by sign-in providers | Your device, Better Auth, Apple, Google | Required for secure sign-in and account features |
| User content | Text you submit for translation or respelling, selected source language, selected target language, generated output streamed back to the app | You | Required only when you use translation or respelling |
| Usage and quota data | Operation type, stream ID, request ID, model name where recorded, input character counts, reserved/charged quota units, quota period counters, timestamps, request state such as completed, failed, or stopped | App and backend | Required to provide free/paid quota and prevent abuse |
| Subscription and purchase data | RevenueCat app user ID, entitlement ID, product ID, active subscription status, store subscription IDs, transaction IDs, purchase/expiration/grace-period timestamps, store, environment, RevenueCat webhook event IDs and event status | RevenueCat, Apple App Store, Google Play, backend | Required for paid subscription functionality |
| Device and technical data | Platform, operating system, app version/configuration where available, RevenueCat SDK technical information, network metadata, IP address, user agent, request timestamps, backend diagnostic logs | Your device, SDKs, backend infrastructure | Required for app functionality, security, reliability, and subscription processing |
| Email communications | Email address, deletion verification email details, support request contents, timestamps | You, Resend, backend | Required if you request account deletion or contact us |
| Operational deletion data | Deletion queue status, retry counts, last error, deletion timestamps, limited subscription/quota identifiers needed to complete cleanup | Backend | Required when account deletion is requested |

SAPO does not intentionally collect payment card numbers, bank account numbers, precise GPS location, contacts, photos, videos, audio recordings, health data, fitness data, SMS/MMS messages, advertising IDs, or data for targeted ads in the current app.

---

## 4. Accounts, Google Sign-In, And Apple Sign-In

You can open SAPO without signing in. Google or Apple sign-in is optional and is used for account features such as subscriptions, purchase restore, subscription management, and account deletion. SAPO does not create accounts in the background.

When you sign in with Google or Apple, SAPO may receive and store account information provided by the sign-in provider, such as your name, email address, provider account identifier, email verification status, profile image, and sign-in tokens. On iOS, native Apple sign-in requests email and full name. Apple may provide full name only the first time you authorize the app.

SAPO stores authentication/session data on your device using platform secure storage through Expo SecureStore. SAPO stores account, session, and provider-account records in the backend so you can sign in, stay signed in, and use authenticated features.

---

## 5. Translation And Respelling Text

When you use translation or respelling, SAPO sends the text you enter, source language, target language, operation type, stream ID, and an authorization token to SAPO's backend. The backend validates size and format limits, reserves quota, sends the sanitized request to OpenAI's Responses API, and streams the generated output back to your app.

SAPO's current backend is designed not to persist the raw text you submit or the generated text output as normal application data. Raw input/output may still exist temporarily in memory, network buffers, provider systems, security logs, or error handling systems as necessary to process the request, maintain reliability, prevent abuse, comply with law, or enforce provider terms.

SAPO records usage and quota information, such as operation type, stream/request identifiers, model name where recorded, input character counts, quota units, timestamps, and request state. SAPO does not need to store raw submitted text to maintain quota counters.

Do not submit passwords, government IDs, payment card details, health information, children's data, confidential business information, or other sensitive personal data unless you are legally allowed to do so and understand that SAPO and OpenAI must process that text to provide the requested feature. If you choose to submit sensitive personal data in free-form text, you explicitly consent to processing that sensitive data only for the limited purpose of providing the requested translation or respelling, subject to applicable law.

SAPO does not use submitted text or generated output to train its own models. OpenAI processes API content under its business/API terms and policies, including restrictions on use of customer content to develop or improve services unless the customer agrees to such use.

---

## 6. Subscriptions And Purchases

SAPO offers a paid subscription through Apple App Store and Google Play. Subscriptions are managed through RevenueCat.

SAPO and RevenueCat process your SAPO user ID as the RevenueCat app user ID, subscription status, entitlement ID, product ID, store subscription identifiers, transaction identifiers, purchase and expiration timestamps, store, environment, customer information, offerings, restore purchases, and subscription management links.

Apple and Google process payment information, billing, taxes, cancellations, refunds, family sharing, and store account details under their own terms and privacy policies. SAPO does not receive or store your full payment card number or bank account details.

SAPO receives subscription webhooks from RevenueCat and may store normalized webhook event details and, in some cases, the raw RevenueCat payload when needed for processing. SAPO uses this information to grant paid access, restore purchases, prevent one store subscription from being linked to multiple SAPO accounts, reconcile subscription status, enforce quota, resolve disputes, and support account deletion.

Deleting your SAPO account does not cancel your Apple or Google subscription. You must cancel or manage billing through your Apple App Store or Google Play subscription settings.

---

## 7. How We Use Personal Data

SAPO uses personal data for these purposes:

- Provide authenticated sessions.
- Enable Google and Apple sign-in.
- Process translation and respelling requests.
- Stream generated output and allow you to stop active streams.
- Enforce input limits, monthly quota, plan limits, and subscription entitlements.
- Provide, restore, reconcile, and manage subscriptions.
- Send transactional account deletion verification email.
- Process account deletion and related cleanup.
- Maintain security, prevent abuse, debug errors, and keep the service reliable.
- Respond to support, privacy, legal, and regulatory requests.
- Comply with applicable law, app store rules, tax/accounting obligations where applicable, and valid legal process.

SAPO does not use personal data for third-party advertising, targeted advertising, data broker disclosure, cross-context behavioral advertising, or selling personal data.

---

## 8. Legal Bases For EEA, UK, And Similar Laws

Where GDPR, UK GDPR, Swiss FADP, LGPD, or similar laws require a legal basis, SAPO relies on the following bases as applicable:

| Purpose | Legal Basis |
|---|---|
| Account access, authentication, translation, respelling, subscription access, purchase restore, and account management | Performance of a contract or steps taken at your request |
| Processing user-submitted text that may contain personal data | Performance of a contract or your consent where required by law |
| Processing sensitive data you voluntarily include in free-form text | Explicit consent where required by law, limited to providing the requested feature |
| Security, abuse prevention, quota enforcement, operational logs, service reliability, debugging, and fraud prevention | Legitimate interests, provided those interests are not overridden by your rights |
| Transactional account deletion emails and support responses | Performance of a contract, legitimate interests, or legal obligation |
| Subscription records, app store compliance, dispute resolution, tax/accounting where applicable, and legal requests | Legal obligation, performance of a contract, or legitimate interests |

You may object to processing based on legitimate interests. You may withdraw consent where processing is based on consent, but withdrawal does not affect processing that occurred before withdrawal and may prevent SAPO from providing the relevant feature.

---

## 9. Sharing, Service Providers, And Tools

SAPO discloses personal data only as needed for the purposes described in this Policy. Some entries below are independent service providers; Better Auth is authentication software running as part of SAPO's backend rather than a separate hosted recipient in the current codebase.

| Provider Or Tool | Role | Data Processed | Purpose |
|---|---|---|---|
| Convex | Backend hosting, database, server functions, authentication integration | Account records, sessions, auth tokens, usage/quota records, subscription state, operational records, technical metadata | Run SAPO backend and store application data |
| Better Auth | Authentication software running with SAPO backend | User, account, session, verification, and OAuth token records | Authentication and account deletion support |
| OpenAI | AI model/API provider | Submitted text, language labels, generated output, technical request metadata | Generate translation and respelling output |
| RevenueCat | Subscription management processor | App user ID, customer info, receipts/purchase tokens, entitlements, products, subscription status, webhook events, device technical information | Subscription purchase, restore, entitlement, reconciliation, and account deletion support |
| Apple | Sign in with Apple and App Store billing | Apple identity token, email/name where provided, store account/payment/subscription data processed by Apple | Sign-in and iOS subscription billing |
| Google | Google sign-in and Google Play billing | Google sign-in data, store account/payment/subscription data processed by Google | Sign-in and Android subscription billing |
| Resend | Transactional email processor | Email address, deletion verification email template variables, email delivery metadata | Send account deletion verification email |
| Infrastructure and network providers | Hosting, security, logging, and delivery providers used by the services above | IP address, user agent, timestamps, request metadata, diagnostic data | Security, routing, reliability, and operations |

SAPO may also disclose information if required by law, to protect rights and safety, to enforce terms, to respond to valid legal process, or as part of a merger, acquisition, financing, reorganization, or transfer of the service, subject to appropriate safeguards.

---

## 10. App Store And Data Safety Disclosure Summary

This section summarizes current practices for app store privacy labels and data safety forms. Store taxonomies differ, and the final store-console answers must match the store's current definitions.

| Store Data Type | Collected/Processed? | Linked To You? | Purpose |
|---|---|---|---|
| Name | Yes, if provided by Apple/Google sign-in | Yes | Account management and app functionality |
| Email address | Yes, for authenticated accounts and deletion email | Yes | Account management, app functionality, transactional communication |
| User ID | Yes, SAPO and RevenueCat user IDs | Yes | App functionality, account management, security, subscription management |
| Other user content | Yes, text submitted for translation/respelling | May be linked during request by session/account token | App functionality; processed primarily in real time |
| Purchase history | Yes, subscription status and transaction/subscription identifiers | Yes | App functionality, account management, fraud prevention, compliance |
| App activity or usage data | Yes, operation type, quota counters, character counts, stream/request state | Yes | App functionality, quota enforcement, security, reliability |
| Diagnostics or technical data | Yes, IP address, user agent, timestamps, errors, request metadata, SDK technical data | May be linked | Security, reliability, debugging, fraud prevention |
| Device or other IDs | RevenueCat and platform services may process device/app identifiers or store receipt tokens | May be linked | Subscription functionality, fraud prevention, app functionality |
| Precise location, contacts, photos, videos, audio, health, fitness, SMS/MMS, advertising data | No current app collection found | Not applicable | Not applicable |

SAPO does not use collected data for tracking as Apple defines tracking, does not share data with data brokers, and does not sell or share personal data for targeted advertising under U.S. state privacy laws.

---

## 11. Local Device Storage

SAPO uses Expo SecureStore to store authentication/session data securely on your device. The current client-side state stores used for text input, language selections, active stream state, subscription state, and last translation are in-memory app state and are not configured for persistent local storage in the current codebase.

Your operating system, app store, RevenueCat SDK, or sign-in provider may maintain their own local records, caches, or account state under their own policies.

---

## 12. Retention

SAPO keeps personal data only as long as reasonably necessary for the purposes described in this Policy, unless a longer period is required or permitted by law.

| Data | Retention |
|---|---|
| Raw submitted text and generated output | Not intentionally stored as normal SAPO application data after request completion; temporarily processed in memory, transit, streaming, and provider systems as needed |
| Account records | While your account exists, then deleted or de-identified through the account deletion workflow unless retention is required by law or necessary for security/dispute purposes |
| Session tokens | Until expiration, sign-out, account deletion, or backend cleanup |
| OAuth/provider tokens | While needed for sign-in/account functionality; Apple tokens are attempted to be revoked during account deletion where available |
| Usage and quota records | While needed for quota enforcement, subscription integrity, dispute resolution, security, and account operation; removed during account deletion except limited preserved records described below |
| Subscription state and RevenueCat data | While needed to provide subscriptions, reconcile purchases, restore entitlements, prevent duplicate subscription linking, support disputes, comply with store rules, or process account deletion |
| RevenueCat webhook events | Retained while needed for processing, retries, reconciliation, audit, and dispute handling; automatic purging depends on backend retention configuration |
| Frozen quota periods after deletion | If an active subscriber deletes the account, SAPO may preserve a limited quota-period record with user ID removed for subscription/quota integrity; default retention in code is 60 days unless configured otherwise |
| Deletion queue records | Retained while deletion is pending, retrying, or needs operational recovery; cleared when cleanup completes where possible |
| Operational logs | Retained for limited periods according to backend, infrastructure, and provider configurations for security, reliability, and debugging |
| Support and privacy communications | Retained as long as needed to respond, maintain records of the request, resolve disputes, and comply with law |

Backups and provider logs may persist for limited periods before deletion cycles complete. App stores, RevenueCat, Apple, Google, OpenAI, Convex, and Resend may retain data under their own legal obligations, processor terms, and privacy policies.

---

## 13. Account Deletion And Data Controls

Signed-in users can request account deletion in the app through **Settings > Data controls > Delete account**. SAPO sends a verification email before deleting the account.

When deletion is confirmed, SAPO begins an asynchronous cleanup workflow that may:

- Stop active translation or respelling streams.
- Finalize or stop active usage/quota events.
- Delete or de-identify subscription state, quota periods, usage events, stream controls, and RevenueCat event references associated with the account.
- Attempt to delete the related RevenueCat customer record where configured and permitted.
- Attempt to revoke Sign in with Apple tokens where available.
- Preserve limited de-identified or operational records where needed for subscription integrity, fraud prevention, legal compliance, dispute resolution, or deletion retry/recovery.

Deletion can take time because SAPO must wait for authentication deletion confirmation, stop in-flight work, process retries, and coordinate with service providers. If cleanup fails temporarily, SAPO may retry through scheduled background jobs.

Deleting your SAPO account does not cancel Apple App Store or Google Play billing. Manage or cancel subscriptions through your Apple or Google account subscription settings.

---

## 14. Your Privacy Rights

Depending on where you live, you may have rights to:

- Access or know what personal data we process about you.
- Receive a copy of your personal data in a portable format.
- Correct inaccurate personal data.
- Delete personal data.
- Restrict or object to processing.
- Withdraw consent where consent is the legal basis.
- Opt out of sale, sharing, or targeted advertising. SAPO does not sell personal data or share it for targeted advertising.
- Appeal a denied privacy request where applicable.
- Use an authorized agent where applicable.
- Avoid discrimination for exercising privacy rights.
- Lodge a complaint with your local data protection authority or regulator.

To exercise rights, contact **support@sapo.surf**. We may need to verify your identity or authority before acting on a request. For signed-in accounts, we may ask you to verify through account access or email.

If we do not hold data that can reasonably be linked to you, or if data has already been deleted, de-identified, or only processed ephemerally, we will explain that in our response.

---

## 15. U.S. State Privacy Disclosures

For residents of California and other U.S. states with comprehensive privacy laws, SAPO provides the following disclosures.

| Category | Collected | Sources | Purposes | Disclosed To |
|---|---|---|---|---|
| Identifiers | Yes | You, device, Apple, Google, RevenueCat | Account, authentication, subscription, security | Service providers listed in this Policy |
| Personal information categories under Cal. Civ. Code 1798.80 | Yes, such as name/email if you sign in | You, Apple, Google | Account management, support, deletion email | Service providers listed in this Policy |
| Commercial information | Yes, subscription and purchase status | RevenueCat, Apple, Google | Subscription access, restore, compliance, dispute handling | RevenueCat, Apple, Google, backend providers |
| Internet or electronic network activity | Yes, request metadata, app/backend interactions, usage/quota events | App, backend, SDKs | App functionality, security, reliability | Service providers listed in this Policy |
| Geolocation | No precise GPS location; IP address may imply general location to providers | Network/infrastructure | Security, routing, fraud prevention | Infrastructure and service providers |
| Sensitive personal information | Not intentionally requested; may appear in free-form text if you submit it | You | Only to provide requested translation/respelling | OpenAI and backend providers as needed |
| Inferences | No profiling or advertising inferences | Not applicable | Not applicable | Not applicable |

SAPO does not sell personal information, does not share personal information for cross-context behavioral advertising, and does not use sensitive personal information to infer characteristics about you.

---

## 16. International Transfers

SAPO and its service providers may process personal data in the United States and other countries where we or our providers operate. These countries may have privacy laws different from your country.

Where required, SAPO relies on appropriate transfer safeguards, such as data processing agreements, standard contractual clauses, adequacy decisions, the EU-U.S. Data Privacy Framework where applicable to a provider, or other lawful transfer mechanisms.

---

## 17. Security

SAPO uses technical, organizational, and administrative safeguards appropriate to the nature of the data, including encrypted transport, secure on-device storage for session data, access controls, provider security controls, and operational monitoring.

No system is perfectly secure. You should avoid submitting sensitive information unless necessary for your use of the app.

---

## 18. Children And Teens

SAPO is not directed to children under 13, and it is not intended for anyone below the age where parental consent is required in their location. Users under 18 should use SAPO only with permission from a parent or guardian.

SAPO does not knowingly collect personal data from children. If you believe a child provided personal data to SAPO, contact us so we can take appropriate action.

---

## 19. Automated Decisions And AI Output

SAPO uses automated systems to generate translation and respelling output, enforce quotas, determine subscription entitlement status, and block requests during deletion or quota exhaustion. SAPO does not use personal data for automated decisions that produce legal or similarly significant effects about you.

AI-generated output may be inaccurate or incomplete. Do not rely on SAPO output for legal, medical, financial, emergency, or safety-critical decisions.

---

## 20. Do Not Track And Global Privacy Control

SAPO does not track you across apps or websites for advertising, does not sell personal data, and does not share personal data for targeted advertising. Browser-level Do Not Track or Global Privacy Control signals therefore do not change current SAPO behavior. If SAPO's practices change, we will honor legally required opt-out signals.

---

## 21. Changes To This Policy

We may update this Policy as SAPO changes. When we make material changes, we will update the Effective Date and provide notice where required by law or app store rules.

---

## 22. Contact

Privacy and support requests: **support@sapo.surf**

Fallback contact: **juanmarzabala8a@gmail.com**

Do not send privacy requests to **donotreply@sapo.surf**, which is used for transactional emails and may not be monitored.

---

## Version History

- **v2.1 (2026-05-27):** Removed background account creation while keeping Google and Apple sign-in optional.
- **v2.0 (2026-05-11):** Updated for account authentication, Google and Apple sign-in, OpenAI processing, RevenueCat subscriptions, quotas, deletion workflows, app store disclosures, and global privacy rights.
- **v1.0 (2025-09-19):** Initial public release.
