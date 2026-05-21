# S A P O Privacy Policy

**Effective Date:** 2026-05-20  
**Version:** v3.0

This Privacy Policy explains how **Happ Technologies Inc.**, a Delaware C corporation (**Happ Technologies**, **S A P O**, **SAPO**, **we**, **us**, or **our**), collects and uses personal data when you use the S A P O mobile app, backend services, translation and respelling features, subscriptions, account features, and support channels.

Where privacy law uses the term controller, Happ Technologies Inc. is the controller for personal data we determine how and why to process. Third-party app stores, sign-in providers, subscription providers, and other service providers may process data under their own terms and privacy policies.

Contact: **support@sapo.surf**

---

## 1. Summary

- S A P O provides text translation and respelling services.
- S A P O creates anonymous sessions for basic app use and lets you optionally sign in with Google or Apple.
- Text you submit, selected language labels, and request metadata are sent to S A P O's backend and to server-side AI model provider(s) to generate results. Those providers may change over time.
- S A P O offers a paid Polyglot subscription through supported app store subscription providers and RevenueCat.
- S A P O measures current usage limits in input characters, not AI tokens.
- S A P O does not sell personal data, share personal data for targeted advertising, serve ads, or use third-party analytics SDKs in the current app.
- S A P O does not request camera, microphone, contacts, photo library, precise location, health, fitness, SMS/MMS, or advertising tracking permissions in the current app configuration.
- Deleting your S A P O account does not delete or cancel an active subscription. Subscriptions must be managed through the subscription provider, such as Apple through Apple account settings or Google through Google Play settings.

---

## 2. Data We Process

| Category | Examples | Source | Purpose |
|---|---|---|---|
| Account and authentication data | S A P O user ID, anonymous user ID, name, email address, profile image if provided, provider account ID, account timestamps | You, Apple, Google, Better Auth software running with our backend | Account access, sessions, sign-in, account management |
| Session and security data | Session tokens, Convex auth tokens, verification tokens, OAuth tokens where provided, IP address, user agent, request timestamps | Your device, backend, sign-in providers | Secure access, abuse prevention, reliability |
| User content | Text you submit, selected source and target language labels, generated translation or respelling output | You | Provide translation and respelling |
| Usage and quota data | Operation type, request/stream IDs, input character counts, quota counters, plan limits, request state, timestamps | App and backend | Enforce limits, prevent abuse, operate subscriptions |
| Subscription and purchase data | RevenueCat app user ID, entitlement ID, product ID, active subscription status, store, transaction or subscription IDs, purchase and expiration dates, webhook event data, management links | RevenueCat, Apple App Store, Google Play, backend | Provide, restore, reconcile, and manage subscription access |
| Device and technical data | Platform, operating system, app configuration, SDK technical metadata, network metadata, diagnostic logs | Your device, SDKs, backend providers | App functionality, security, debugging, subscription processing |
| Email and support data | Email address, deletion verification email metadata, support or privacy request contents | You, Resend, backend | Account deletion verification, support, legal compliance |
| Account deletion data | Deletion queue status, retry counts, cleanup timestamps, limited subscription/quota identifiers | Backend | Complete account deletion and provider cleanup |

S A P O does not intentionally collect payment card numbers, bank account numbers, precise GPS location, contacts, photos, videos, audio recordings, health data, fitness data, SMS/MMS messages, advertising IDs, or data for targeted advertising in the current app.

---

## 3. Accounts And Sign-In

S A P O can be used with an anonymous session or with a Google or Apple sign-in.

Anonymous sessions use a generated user identifier and session token. They allow the app to authenticate backend requests, provide translation and respelling, enforce quota, stop active streams, and protect the service before you choose whether to sign in. If you later sign in, S A P O may link or migrate relevant anonymous quota or subscription state to the authenticated account so the app continues to work.

When you sign in with Google or Apple, S A P O may receive and store account information provided by that provider, such as name, email address, provider account identifier, email verification status, profile image, and sign-in tokens. On iOS, native Sign in with Apple requests email and full name; Apple may provide full name only the first time you authorize the app.

S A P O stores authentication/session data on your device through Expo SecureStore. The current app does not use AsyncStorage, MMKV, SQLite, or similar persistent local stores for your input text, language selections, active stream state, subscription state, or last translation.

---

## 4. Translation And Respelling Requests

When you use translation or respelling, S A P O sends the text you enter, selected source and target language labels, operation type, stream/request identifier, and an authorization token to S A P O's backend. The backend validates request size and format, checks quota, sends the request to server-side AI model provider(s), and streams generated output back to the app.

S A P O's current backend is designed not to persist the raw text you submit or the generated output as normal application data after request completion. Raw input or output may still exist temporarily in memory, network buffers, provider systems, security logs, error handling systems, or operational systems as necessary to process the request, maintain reliability, prevent abuse, comply with law, or enforce provider terms.

S A P O records usage and quota information such as operation type, request/stream IDs, input character counts, charged quota units, timestamps, and request state. S A P O does not need to store raw submitted text to maintain quota counters.

Do not submit passwords, government IDs, payment card details, health information, children's data, confidential business information, or other sensitive personal data unless you are legally allowed to do so and understand that S A P O and its service providers must process that text to provide the requested feature. If you voluntarily submit sensitive personal data in free-form text, you consent to processing that data only for the limited purpose of providing the requested translation or respelling, where consent is required by law.

S A P O does not use submitted text or generated output to train S A P O-owned AI models. S A P O also does not sell submitted text or generated output.

---

## 5. Subscriptions And Limits

S A P O offers a paid **Polyglot** subscription through supported app store subscription providers, with RevenueCat used for subscription management. Apple, Google, and any other supported subscription provider process payments, billing, taxes, cancellations, refunds, family sharing, and store account data under their own terms and privacy policies. S A P O does not receive or store your full payment card number or bank account details.

S A P O and RevenueCat process the minimum subscription metadata needed to provide the subscription, including S A P O user ID, RevenueCat app user ID, entitlement/product identifiers, active status, store, transaction/subscription IDs, purchase and expiration timestamps, webhook event data, restore-purchase data, and subscription management links.

At launch, current default limits are:

| Plan | Per-translation request input limit | Per-respelling request input limit | Monthly translation input limit | Monthly respelling input limit |
|---|---:|---:|---:|---:|
| Free | 10 characters | 10 characters | 3,000 characters | 3,000 characters |
| Polyglot | 1,000 characters | 300 characters | 500,000 characters | 6,000 characters |

Limits are measured in input characters. The app, backend, and subscription provider records are used to enforce these limits, restore purchases, prevent one store subscription from being linked to multiple S A P O accounts, reconcile entitlement status, resolve disputes, and support account deletion.

Deleting your S A P O account does not delete or cancel an active subscription. You must manage or cancel subscriptions through the subscription provider, such as Apple through Apple account settings or Google through Google Play settings.

---

## 6. Open Phonetic Database

A portion of S A P O's revenue will be used to develop an open phonetic database containing mappings of phonetic respellings from every language to every language. The dataset will be developed by S A P O.

This revenue use does not require S A P O to collect additional personal data. Unless S A P O provides a separate contribution feature, obtains required consent, or uses data that has been de-identified or aggregated so it no longer identifies you, the text you submit in the app is not treated as a public database contribution.

---

## 7. How We Use Personal Data

S A P O uses personal data to:

- Provide anonymous and authenticated sessions.
- Enable Google and Apple sign-in.
- Process translation and respelling requests.
- Stream generated output and allow active streams to be stopped.
- Enforce input limits, monthly quota, rate limits, plan limits, and subscription entitlements.
- Provide, restore, reconcile, and manage subscriptions.
- Send transactional account deletion verification emails.
- Process account deletion and related cleanup.
- Maintain security, prevent abuse and fraud, debug errors, and keep the service reliable.
- Respond to support, privacy, legal, and regulatory requests.
- Comply with applicable law, app store rules, tax/accounting obligations where applicable, and valid legal process.

S A P O does not use personal data for third-party advertising, targeted advertising, cross-context behavioral advertising, data broker disclosure, or selling personal data.

---

## 8. Legal Bases

Where GDPR, UK GDPR, Swiss FADP, LGPD, or similar laws require a legal basis, S A P O relies on the following bases as applicable:

| Purpose | Legal basis |
|---|---|
| App access, anonymous sessions, account access, translation, respelling, subscription access, purchase restore, and account management | Performance of a contract or steps taken at your request |
| Processing text you submit that may contain personal data | Performance of a contract or consent where required |
| Processing sensitive data you voluntarily include in free-form text | Explicit consent where required, limited to providing the requested feature |
| Security, abuse prevention, quota enforcement, operational logs, service reliability, debugging, and fraud prevention | Legitimate interests, where not overridden by your rights |
| Account deletion emails, support responses, subscription records, app store compliance, disputes, tax/accounting where applicable, and legal requests | Performance of a contract, legitimate interests, or legal obligation |

You may object to processing based on legitimate interests and may withdraw consent where processing is based on consent. Withdrawal does not affect processing that occurred before withdrawal and may prevent S A P O from providing the relevant feature.

---

## 9. Sharing And Service Providers

S A P O discloses personal data only as needed for the purposes described in this Policy.

| Provider or tool | Role | Data processed |
|---|---|---|
| Convex | Backend hosting, database, server functions, authentication integration | Account records, sessions, auth tokens, usage/quota records, subscription state, operational records, technical metadata |
| Better Auth | Authentication software running with S A P O's backend | User, account, session, verification, and OAuth token records |
| Server-side AI model provider(s) | Generate translation and respelling output | Submitted text, language labels, generated output, technical request metadata |
| RevenueCat | Subscription management processor | App user ID, customer info, receipts/purchase tokens, entitlements, products, subscription status, webhook events, device technical information |
| Apple | Sign in with Apple and App Store billing | Apple identity token, email/name where provided, store account/payment/subscription data processed by Apple |
| Google | Google sign-in and Google Play billing | Google sign-in data, store account/payment/subscription data processed by Google |
| Resend | Transactional email processor | Email address, deletion verification email variables, email delivery metadata |
| Infrastructure and network providers | Hosting, security, logging, and delivery services | IP address, user agent, timestamps, request metadata, diagnostic data |

S A P O may also disclose information if required by law, to protect rights and safety, to enforce the [Terms of Use](/terms-of-use), to respond to valid legal process, or as part of a merger, acquisition, financing, reorganization, or transfer of the service, subject to appropriate safeguards.

---

## 10. App Store Disclosure Summary

This section summarizes current practices for app store privacy labels and data safety forms. Store taxonomies differ, and store-console answers must match the store's current definitions.

| Store data type | Processed? | Linked to you? | Purpose |
|---|---|---|---|
| Name | Yes, if provided by Apple/Google sign-in | Yes | Account functionality |
| Email address | Yes, for authenticated accounts, support, and deletion email | Yes | Account functionality, communication |
| User ID | Yes, S A P O, anonymous, and RevenueCat IDs | Yes | App functionality, security, subscription management |
| Other user content | Yes, text submitted for translation/respelling | May be linked during request by session/account token | App functionality |
| Purchase history | Yes, subscription status and transaction/subscription identifiers | Yes | Subscription access, restore, fraud prevention, compliance |
| App activity or usage data | Yes, operation type, quota counters, character counts, request state | Yes | App functionality, quota enforcement, security, reliability |
| Diagnostics or technical data | Yes, IP address, user agent, timestamps, errors, request metadata, SDK technical data | May be linked | Security, reliability, debugging, fraud prevention |
| Device or other IDs | RevenueCat and platform services may process device/app identifiers or receipt tokens | May be linked | Subscription functionality, fraud prevention |
| Precise location, contacts, photos, videos, audio, health, fitness, SMS/MMS, advertising data | No current app collection found | Not applicable | Not applicable |

S A P O does not use collected data for tracking as Apple defines tracking, does not share data with data brokers, and does not sell or share personal data for targeted advertising under U.S. state privacy laws.

---

## 11. Retention

S A P O keeps personal data only as long as reasonably necessary for the purposes described in this Policy, unless a longer period is required or permitted by law.

| Data | Retention |
|---|---|
| Raw submitted text and generated output | Not intentionally stored as normal S A P O application data after request completion; temporarily processed in memory, transit, streaming, and provider systems as needed |
| Account records | While your account exists, then deleted or de-identified through the account deletion workflow unless retention is required by law or necessary for security, fraud prevention, or disputes |
| Anonymous session records | While needed to provide the app, enforce quotas, maintain security, or until deleted/de-identified through applicable cleanup or verified request |
| Session and provider tokens | Until expiration, sign-out, account deletion, or backend cleanup; Sign in with Apple tokens are attempted to be revoked during deletion where available |
| Usage and quota records | While needed for quota enforcement, subscription integrity, dispute resolution, security, and account operation; removed during account deletion except limited preserved records described here |
| Subscription state and RevenueCat data | While needed to provide subscriptions, reconcile purchases, restore entitlements, prevent duplicate subscription linking, support disputes, comply with store rules, or process deletion |
| Frozen quota periods after deletion | If an active subscriber deletes the account, S A P O may preserve a limited quota-period record with user ID removed for subscription/quota integrity; the default configuration is 60 days |
| Deletion queue records | While deletion is pending, retrying, or needs operational recovery; cleared when cleanup completes where possible |
| Operational logs | Retained for limited periods according to backend, infrastructure, and provider configurations for security, reliability, and debugging |
| Support and privacy communications | As long as needed to respond, maintain request records, resolve disputes, and comply with law |

Backups and provider logs may persist for limited periods before deletion cycles complete. App stores, RevenueCat, Apple, Google, Convex, Resend, server-side AI model provider(s), and infrastructure providers may retain data under their own legal obligations, processor terms, and privacy policies.

---

## 12. Account Deletion And Data Controls

Authenticated users can request account deletion in the app through **Settings > Data controls > Delete account**. S A P O sends a verification email before deleting the account.

To complete account deletion, you must open the email deletion link on the device where S A P O is installed and where you are signed in to the S A P O account that requested deletion. If you open the link on another device, in a browser, while signed out, or while signed in to a different account, deletion may not complete.

When deletion is confirmed, S A P O begins an asynchronous cleanup workflow that may:

- Stop active translation or respelling streams.
- Finalize or stop active usage/quota events.
- Delete or de-identify subscription state, quota periods, usage events, stream controls, and RevenueCat event references associated with the account.
- Attempt to delete the related RevenueCat customer record where configured and permitted.
- Attempt to revoke Sign in with Apple tokens where available.
- Preserve limited de-identified or operational records where needed for subscription integrity, fraud prevention, legal compliance, dispute resolution, or deletion retry/recovery.

Deletion can take time because S A P O must wait for authentication deletion confirmation, stop in-flight work, process retries, and coordinate with service providers. If cleanup fails temporarily, S A P O may retry through scheduled background jobs.

Deleting your S A P O account does not delete or cancel an active subscription. You must manage or cancel subscriptions through the subscription provider, such as Apple through Apple account settings or Google through Google Play settings.

Anonymous sessions cannot currently be deleted through the in-app account deletion button. Contact **support@sapo.surf** if you want help with an anonymous-session privacy request. We may need limited session, device, timing, or request details to locate relevant records without collecting more data than necessary.

---

## 13. Your Privacy Rights

Depending on where you live, you may have rights to:

- Access or know what personal data we process about you.
- Receive a copy of your personal data in a portable format.
- Correct inaccurate personal data.
- Delete personal data.
- Restrict or object to processing.
- Withdraw consent where consent is the legal basis.
- Opt out of sale, sharing, targeted advertising, or profiling where applicable. S A P O does not sell personal data or share it for targeted advertising.
- Appeal a denied privacy request where applicable.
- Use an authorized agent where applicable.
- Avoid discrimination for exercising privacy rights.
- Lodge a complaint with your local data protection authority or regulator.

To exercise rights, contact **support@sapo.surf**. We may need to verify your identity or authority before acting on a request. For authenticated accounts, we may ask you to verify through account access or email. For anonymous sessions, we may ask for limited information needed to locate data while minimizing additional collection.

If we do not hold data that can reasonably be linked to you, or if data has already been deleted, de-identified, or only processed ephemerally, we will explain that in our response.

---

## 14. U.S. State Privacy Disclosures

For residents of California and other U.S. states with comprehensive privacy laws, S A P O provides the following disclosures.

| Category | Collected | Sources | Purposes | Disclosed to |
|---|---|---|---|---|
| Identifiers | Yes | You, device, Apple, Google, RevenueCat | Account, authentication, subscription, security | Service providers listed in this Policy |
| Personal information under Cal. Civ. Code 1798.80 | Yes, such as name/email if you sign in | You, Apple, Google | Account management, support, deletion email | Service providers listed in this Policy |
| Commercial information | Yes, subscription and purchase status | RevenueCat, Apple, Google | Subscription access, restore, compliance, disputes | Subscription and backend providers |
| Internet or electronic network activity | Yes, request metadata, app/backend interactions, usage/quota events | App, backend, SDKs | App functionality, security, reliability | Service providers listed in this Policy |
| Geolocation | No precise GPS location; IP address may imply general location to providers | Network/infrastructure | Security, routing, fraud prevention | Infrastructure and service providers |
| Sensitive personal information | Not intentionally requested; may appear in free-form text if you submit it | You | Only to provide requested translation/respelling | AI model and backend providers as needed |
| Inferences | No advertising or profiling inferences | Not applicable | Not applicable | Not applicable |

S A P O does not sell personal information, does not share personal information for cross-context behavioral advertising, and does not use sensitive personal information to infer characteristics about you.

---

## 15. International Transfers

S A P O and its service providers may process personal data in the United States and other countries where we or our providers operate. These countries may have privacy laws different from your country.

Where required, S A P O relies on appropriate transfer safeguards, such as data processing agreements, standard contractual clauses, adequacy decisions, the EU-U.S. Data Privacy Framework where applicable to a provider, or other lawful transfer mechanisms.

---

## 16. Security

S A P O uses technical, organizational, and administrative safeguards appropriate to the nature of the data, including encrypted transport, secure on-device storage for session data, access controls, provider security controls, and operational monitoring.

No system is perfectly secure. You should avoid submitting sensitive information unless necessary for your use of the app.

---

## 17. Children And Teens

S A P O is not directed to children under 13, and it is not intended for anyone below the age where parental consent is required in their location. Users under 18 should use S A P O only with permission from a parent or guardian.

S A P O does not knowingly collect personal data from children. If you believe a child provided personal data to S A P O, contact us so we can take appropriate action.

---

## 18. Automated Decisions And AI Output

S A P O uses automated systems to generate translation and respelling output, enforce quotas, determine subscription entitlement status, and block requests during deletion or quota exhaustion. S A P O does not use personal data for automated decisions that produce legal or similarly significant effects about you.

AI-generated output may be inaccurate or incomplete. Do not rely on S A P O output for legal, medical, financial, emergency, or safety-critical decisions.

---

## 19. Do Not Track And Global Privacy Control

S A P O does not track you across apps or websites for advertising, does not sell personal data, and does not share personal data for targeted advertising. Browser-level Do Not Track or Global Privacy Control signals therefore do not change current S A P O behavior. If S A P O's practices change, we will honor legally required opt-out signals.

---

## 20. Changes To This Policy

We may update this Policy as S A P O changes. When we make material changes, we will update the Effective Date and provide notice where required by law or app store rules.

---

## 21. Contact

Privacy and support requests: **support@sapo.surf**

Do not send privacy requests to **donotreply@sapo.surf**, which is used for transactional emails and may not be monitored.
