# S A P O Privacy Policy

**Effective Date:** 2026-10-07

**Version:** 5

**Happ Technologies Inc.**, a Delaware C corporation based in the United States (**SAPO**, **we**, **us**, or **our**), is the controller for personal data we process to operate the S A P O app, cloud services, subscriptions, websites, and Multilingual phonetic representations database.

**Privacy contact:** [support@sapo.surf](mailto:support@sapo.surf). Account deletion instructions are available [here](/delete-account).

This Policy explains our practices and does not itself provide consent. Where separate permission is required, accepting the Terms or using the Service does not replace it. Your mandatory privacy rights remain available.

## 1. Data We Process And Why

| Category                      | Data and source                                                                                                                                                                                                                                                                                                      | Purpose                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Account and authentication    | User ID, name, email (including Apple relay addresses), profile image if supplied, sign-in provider/account identifiers, verification status, account dates, and authentication, session, and verification tokens from you, Apple, Google, and our backend                                                           | Create and secure accounts, sign you in, manage sessions, and verify deletion              |
| Submitted content             | Your text and language choices; generated translations, previews, pronunciation respellings, and detected source language where needed                                                                                                                                                                               | Perform the feature you request on-device or through cloud providers                       |
| Usage and security            | Account/request IDs, operation, model identifier where recorded, input character counts, quota reservations/charges, status, timestamps, IP address, user agent, and security events from your device and backend                                                                                                    | Enforce access and quotas, prevent duplicate charges and abuse, and investigate failures   |
| Purchases and subscriptions   | SAPO/RevenueCat customer IDs, products, entitlements, store and transaction/subscription IDs, receipts or purchase tokens handled by the SDK, status, billing/expiration dates, webhook records, and management links from RevenueCat and stores                                                                     | Verify purchases, provide and restore access, reconcile billing, and prevent fraud         |
| Device and local storage      | Platform, OS/app/SDK versions, SDK identifiers where used, request and diagnostic information; secure account/subscription caches containing user ID, email, plan, access status/expiration, and confirmation time; model selection/status, storage checks, model files, partial downloads, and verification records | Compatibility, delivery, troubleshooting, offline access checks, and local model operation |
| Website and database browsing | Requested URLs, language filters, page requests, IP address, time, and ordinary browser/network information from your browser and providers                                                                                                                                                                          | Deliver pages and database results and secure the website/backend                          |
| Support, email, and deletion  | Contact details and correspondence you send; verification links, email delivery information, account/subscription identifiers, cleanup status, retries, error summaries, operational alerts, and timestamps                                                                                                          | Provide support, complete deletion, resolve failures, and meet legal obligations           |

Account and request information is necessary for cloud features; purchase records are necessary for subscription access. Local translation and public database browsing do not require an account. Earlier anonymous-account records remain covered by this Policy, although the current app does not create new anonymous accounts. Do not submit personal or confidential information through shared review/demo accounts.

The current app does not request camera, microphone, contacts, photo-library, precise GPS, health/fitness, SMS, or advertising-tracking access. IP addresses can reveal approximate location. Text and support messages may contain personal or sensitive information even though we do not request it.

## 2. Local And Cloud Processing

### Local translation

On supported iOS and Android devices, downloaded models can translate text on-device without sending that request's text, languages, output, or character count to SAPO's backend or cloud AI. Local-model errors do not automatically send text to cloud AI. Once a model is downloaded and loaded, local translation can work offline; sign-in and subscription features may still communicate when connected.

Models come from **Hugging Face** and its delivery infrastructure. The download host receives your IP address, requested file/model, time, and ordinary request headers, but not your translation text or SAPO sign-in token.

### Cloud translation and pronunciation respelling

Cloud requests send your text, language choices, operation, request ID, and authorization token to **SAPO's backend** for authentication, access checks, and processing. The backend sends text and language information with task instructions to:

- **Cloudflare Workers AI** for standalone cloud translation.
- **OpenAI through Cloudflare AI Gateway** for pronunciation respelling and both stages of **translate and respell** mode.

In translate and respell mode, OpenAI first translates the original text into your target language. SAPO's backend streams a preview to the app and sends the completed translation to OpenAI through the gateway for pronunciation respelling in your selected language. Choosing **Source** uses the original source language, detected by OpenAI where needed. Both stages run in the cloud even when local translation is enabled. An interrupted or failed translation does not start respelling.

AI requests do not intentionally include your account name, email, purchase records, or session token. Personal information included in your text or generated translation is nevertheless sent to the relevant AI providers, and SAPO's backend can associate the request with your account. Cloud content is not necessarily anonymous.

Our database records usage metadata, not a translation history of raw input, intermediate translations, or output. Combined requests use the original input character count in a single respelling usage event; limits and charging rules are in the [Terms of Use](/terms-of-use).

**Provider retention:** [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/observability/logging/) can log prompts and responses; logging is enabled by default unless disabled in deployment settings. Logs and caches may outlast either stage. Our OpenAI calls use `store: false`, which does not disable gateway logging or all OpenAI retention. [OpenAI's data controls](https://developers.openai.com/api/docs/guides/your-data) describe default abuse-monitoring retention of up to 30 days, subject to legal/security exceptions, and model-dependent prompt caching with a maximum application-state retention period of 24 hours. We do not claim approved zero-data-retention controls.

We do not train SAPO-owned AI models on your text or output. Our policy is to opt out of third-party training or other unrelated uses and disable optional content retention where those controls are available to us. OpenAI states that API data is not used for model training by default unless the API customer opts in. Providers may still process and retain data for service delivery, security, abuse prevention, or law.

Do not submit passwords, payment credentials, government identifiers, health records, biometric information, or other highly sensitive data to cloud features. Remove unnecessary personal details and submit others' information only with lawful authority. Entering sensitive text is not explicit consent to special-category processing, training, or publication.

## 3. Device Storage And Public Database

The app holds input, output, translation previews, language/mode selections, and active requests in memory, without a persistent local translation-history feature. Native authentication and account/subscription caches use **Expo SecureStore** and operating-system secure storage. Sign-out/account-state changes trigger cache cleanup; expired subscription confirmations do not grant access. OS backup, restore, and keychain behavior may leave residual copies. Uninstalling the app does not delete server records.

Model files, partial downloads, and verification records are stored in the app cache. Remove models through **Settings > Local models**; the OS may also remove cached files. Text you choose to copy can remain on the clipboard and be available to other apps or synchronized devices under OS settings.

Web-app authentication, where available, uses browser storage for sessions, not advertising. Clearing site data may sign you out. External sign-in providers and sites use storage under their own policies.

The public **[Multilingual phonetic representations](/multilingual-phonetic-representations)** browser makes read-only requests to the website's backend without sign-in; the backend queries the published database hosted by Turso. It sends language filters and page-request information with network metadata; filters also appear in the URL and can remain in browser history or shared links. Browsing does not send text to AI providers. Using the app does not contribute your input, intermediate translation, or output to the public database. Published entries can be accessed and copied by others; contact our privacy address if an entry exposes personal data or infringes your rights.

## 4. Legal Grounds

Where applicable law requires a legal basis, including the GDPR, UK GDPR, or Brazil's LGPD, we use the relevant grounds for each purpose:

| Purpose                                                                                                                   | Legal ground where applicable                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Requested features, accounts, model delivery, subscriptions, website/database results, and service support                | Contract performance or steps you request before entering a contract                                                         |
| Security, abuse prevention, diagnostics, subscription integrity, failure recovery, other correspondence, and legal claims | Legitimate interests in a secure, reliable service and protecting rights, subject to your rights and reasonable expectations |
| Statutory privacy requests, required records, valid legal process, and regulatory duties                                  | Legal obligation                                                                                                             |
| Processing requiring consent                                                                                              | Separate consent for the specified purpose                                                                                   |

Contract necessity does not automatically authorize processing others' personal data or special-category data. Where consent is the basis, withdraw it through our privacy contact or an available relevant control; withdrawal does not invalidate earlier lawful processing. We do not condition unrelated services on optional processing. Refusal or withdrawal may prevent a feature that needs the affected data from operating. You may object to legitimate-interest processing; we stop unless law permits continuation.

## 5. Recipients

We disclose data for the purposes in this Policy and limit access to the relevant role. We require third parties receiving personal data from SAPO to provide the same or equivalent protection described in this Policy and required by applicable law and app-store rules. Providers acting on our behalf are subject to contractual data-protection duties. Apple, Google, and other providers may act separately as controllers for their own accounts, billing, security, or legal obligations; their policies do not remove SAPO's responsibilities.

| Provider                                                                                        | Role and data involved                                                                                                                                   |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SAPO backend hosting and database providers                                                     | Backend/database; accounts, authentication, usage, subscription/deletion records, technical logs, and cloud content in processing                        |
| [Turso](https://turso.tech/privacy-policy)                                                      | Published pronunciation database hosting and backend database query metadata                                                                             |
| Better Auth                                                                                     | Authentication software running in our backend; account, session, verification, and provider-token records                                               |
| [Cloudflare](https://www.cloudflare.com/privacypolicy/)                                         | Workers AI and AI Gateway; text, languages, intermediate translations, output, request metadata, and logs/caches where enabled                           |
| [OpenAI](https://openai.com/policies/privacy-policy/)                                           | API translation/respelling and source detection; text, languages, intermediate translations, instructions, output, and operational/abuse-monitoring data |
| [Hugging Face](https://huggingface.co/privacy) and download hosts                               | Model delivery; IP address, requested files, and download metadata, not local translation content                                                        |
| [RevenueCat](https://www.revenuecat.com/privacy/)                                               | Subscription management; customer IDs, purchases/receipts, products, entitlements, status, webhooks, and SDK metadata                                    |
| [Apple](https://www.apple.com/legal/privacy/) and [Google](https://policies.google.com/privacy) | Sign-in data and store purchases; payment and store-account information under their control                                                              |
| [Resend](https://resend.com/legal/privacy-policy)                                               | Verification emails, delivery metadata, and operational emails with relevant account/event identifiers and errors                                        |
| Website hosting, network, and support providers                                                 | Page/request metadata, security logs, and support correspondence                                                                                         |

Apple and Google handle payment credentials; SAPO does not receive full payment-card details. We may also disclose necessary data to advisers or authorities for legal obligations, claims, or protection of rights and safety, or during a business transfer, subject to safeguards and required notice.

## 6. International Processing

Our providers may process data in the United States and other countries where they and their subprocessors operate. Local laws and government-access rules may differ; cloud data is not guaranteed to stay in your country.

Transfers requiring safeguards must use an applicable adequacy decision, standard contractual clauses with required UK/Swiss provisions, or another locally authorized mechanism. A provider's Data Privacy Framework certification applies only if current and relevant; SAPO does not claim its own certification. Locally required transfer consent or other conditions remain necessary. Contact our privacy address for processing locations and applicable safeguards, including copies subject to necessary redactions.

## 7. Retention

We retain data only as needed for the purposes described, taking account of account status, subscriptions, security, disputes, legal duties, and deletion requests. Where a fixed period is unavailable, these criteria determine retention.

| Data                                                                      | Retention and deletion                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input, previews, and output                                               | In app/runtime memory; no persistent translation history. Cloud provider logs/caches follow section 2 and configured controls rather than an assumed automatic deletion period                                                           |
| Models and verification files                                             | Until removed in local-model settings or evicted by the OS; interrupted downloads may leave partial files                                                                                                                                |
| Secure account/subscription caches                                        | Replaced as confirmed state changes and cleared through sign-out/account cleanup, subject to OS storage/backup behavior                                                                                                                  |
| Account, authentication, usage, quota, and subscription records           | For account operation and the purposes above; account deletion removes associated records except the limited exceptions below. Earlier anonymous records follow the same criteria or a verified deletion request                         |
| Preserved subscription quota after deletion                               | User ID removed; subscription/period identifiers and counters may remain to prevent quota resets. Frozen records become eligible for daily cleanup 60 days after the quota period ends; they are pseudonymous, not necessarily anonymous |
| Backend RevenueCat webhook records                                        | Terminal records become eligible for daily cleanup 90 days after their last update; unresolved/retry records remain until resolved                                                                                                       |
| Operational alerts                                                        | Resolved alerts become eligible for daily cleanup 90 days after resolution; unresolved alerts remain for investigation/recovery                                                                                                          |
| Backend transactional email records                                       | Daily cleanup retains finalized emails for one week and abandoned emails for four weeks; Resend's records are governed separately                                                                                                        |
| Deletion records                                                          | Until cleanup and necessary retry/recovery complete                                                                                                                                                                                      |
| Other request/security logs, backups, support, and privacy correspondence | For delivery, security, recovery, response handling, legal duties, or disputes, under the relevant retention/deletion cycles                                                                                                             |

Batches, outages, retries, and legal holds can delay cleanup. Retained exceptions are limited to their necessary purpose. Backups and providers may take additional time to expire; stores may retain legally required transaction records. Browser history and clipboard or external copies follow the relevant device/browser controls.

## 8. Deletion And Your Controls

**In-app deletion:** Go to **Settings > Data controls > Delete account** and request the verification email. Open the link on a device with SAPO installed and signed in to the requesting account. An expired link, browser, or different account can prevent completion.

**Outside the app:** Use the [Delete account page](/delete-account) or email [support@sapo.surf](mailto:support@sapo.surf) with **SAPO Account Deletion** and your account email, including if you cannot access the app. We may require proportionate identity verification. Do not send passwords or sign-in tokens.

Deletion removes the account and authentication data and starts background cleanup of related subscription, usage, quota, and event records, with RevenueCat customer deletion and revocation of available Apple sign-in tokens. Limited records remain as described in section 7. Failed cleanup is retried; contact support for status.

**Account deletion does not cancel an app-store subscription.** You do not need to cancel before requesting deletion, but must manage billing through [Apple](https://apps.apple.com/account/subscriptions) or [Google Play](https://play.google.com/store/account/subscriptions). Deletion ends account-based access. You may request deletion of particular data without closing the account where law permits, although some data is necessary for continued features.

Remove models in local-model settings, sign out for account-cache cleanup, and use device/browser controls for local copies. Server deletion does not erase every device, backup, clipboard, or store record. For older anonymous-session records, contact us with available identifying information; we may be unable to locate records that cannot reasonably be linked to you.

## 9. Privacy Rights And Requests

Depending on applicable law, you may confirm processing, access your data and its sources/recipients, correct it, obtain a portable copy, delete it, restrict or object to processing, withdraw consent, and complain to a regulator. Local rights may also include anonymizing or blocking unnecessary/unlawful data, limiting qualifying sensitive-data processing, appointing an agent or nominee, or reviewing certain automated decisions.

Send requests to [support@sapo.surf](mailto:support@sapo.surf) with enough information to locate your records. No new account is required. Authorized agents may act with proof of authority, and proportionate verification may be required. Verification information is used for verification/security only.

We respond within applicable legal deadlines and notify you of permitted extensions. Requests are normally free; we charge or refuse only where law permits and explain any refusal and available remedies. We do not unlawfully discriminate or retaliate for exercising rights.

To appeal, reply to our decision or email **Privacy Appeal** to the same address. We respond within the applicable appeal deadline and explain further remedies. You may complain directly to your competent privacy regulator where permitted, including an EEA supervisory authority, the UK ICO, or your local national/state authority. You may ask about the consequences of refusing or withdrawing consent. Regional rights apply where the relevant law covers our processing.

## 10. Advertising And U.S. State Disclosures

We do not sell personal data, share it for cross-context behavioral advertising, use it for direct marketing, serve ads, or use third-party advertising or general-purpose analytics SDKs in the current app. We do not offer financial incentives for personal information or use sensitive information to infer characteristics about you. Sensitive information is used only for requested services and legally permitted operational purposes.

Relevant categories during the current/prior policy period include identifiers, customer-record information, commercial information, internet/electronic activity, user content, provider-supplied profile images, and sensitive information in authentication credentials or voluntarily submitted text. Sections 1, 4, 5, and 7 describe sources, purposes, recipients, and retention. Disclosures are for those operational/business purposes. We do not sell or share for advertising information about people under 16.

We honor legally required opt-out signals, including Global Privacy Control where applicable. No advertising opt-out is needed to stop activities we do not conduct; Do Not Track does not otherwise change essential service processing. Applicable state rights, agents, sensitive-data limitations, and appeals follow section 9.

## 11. Security, Children, And Automated Processing

We use encrypted transport, OS secure storage for native authentication/account caches, access controls, server-side authorization, and operational monitoring. No system is completely secure. We provide legally required breach notifications.

SAPO is not directed to children under 13 or intended for people below the age at which they may lawfully use it and authorize the relevant processing. Users under 18 also need parental permission; a store rating does not replace local requirements. We do not offer verified parental-consent enrollment or knowingly collect personal data from children below the applicable minimum age. If this occurs, contact us to investigate and delete the data or take other required action. Parents/guardians may submit verified privacy requests.

AI generates translations and pronunciation respellings and may detect input language. Automated systems check access, quotas, subscriptions, deletion status, and abuse. We do not use personal data for solely automated decisions producing legal or similarly significant effects, targeted advertising, or profiling with such effects. Contact support to contest an incorrect access/subscription decision.

## 12. Changes And Contact

We update the date/version when practices change, give required notice of material changes, and obtain fresh consent where required before new processing. Continued use alone is not consent to a new purpose requiring permission.

**Controller:** Happ Technologies Inc., United States.

**Privacy and support:** [support@sapo.surf](mailto:support@sapo.surf). Use this address for questions, rights requests, complaints, or an accessible copy. **donotreply@sapo.surf** sends transactional email and is not the privacy contact.
