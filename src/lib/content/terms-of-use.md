# S A P O Terms of Use

**Effective Date:** 2026-09-16

**Version:** v3.0

These Terms of Use (**Terms**) are a legally binding agreement between you and **Happ Technologies Inc.**, a Delaware C corporation (**Happ Technologies**, **S A P O**, **SAPO**, **we**, **us**, or **our**) governing your use of the S A P O mobile app, backend services, APIs, subscriptions, translation features, respelling features, and related websites or support channels (together, the **Service**).

For copies downloaded through the Apple App Store, the app license is governed by [Apple's Standard End User License Agreement](https://www.apple.com/legal/internet-services/itunes/dev/stdeula/) (**Apple Standard EULA**). These Terms supplement that license with the conditions for SAPO's accounts, cloud services, subscriptions, and related services; they do not replace it. Section 12 explains how the agreements apply together.

By installing, accessing, or using S A P O, you agree to these Terms to the extent permitted by applicable law. If you do not agree, do not use S A P O. The **[S A P O Privacy Policy](/privacy-policy)** explains our data practices; it is not a blanket consent to processing. Acceptance of these Terms does not replace any separate permission required for third-party AI processing or other uses of personal data.

---

## 1. Who May Use S A P O

You may use S A P O only if you can lawfully enter into these Terms and lawfully use the Service in your location.

S A P O is not directed to children under 13 and is not intended for people below the age at which they may lawfully use the Service and authorize the relevant data processing in their location. If you are under 18, you must also have permission from a parent or legal guardian. A store age rating does not override these requirements. S A P O does not offer a verified parental-consent enrollment process.

You may not use S A P O if you are barred from doing so under applicable law, sanctions, export controls, or app store rules.

---

## 2. What S A P O Does

S A P O provides text translation and respelling services. You enter text, choose supported source and target language options, and S A P O returns generated output.

Online translation uses Cloudflare Workers AI through our Convex backend. Online respelling uses OpenAI through Cloudflare AI Gateway and our backend. On supported iOS and Android devices, you may instead download a model from Hugging Face, load it, and enable on-device translation. Local translation does not send that translation request to cloud AI or consume cloud quota. Respelling remains a cloud feature. Local-model errors do not automatically send your text to cloud AI.

Local models require sufficient storage, memory, and compatible hardware. Downloads use internet data and may incur your network provider's charges. Cached models may be removed by the operating system and need to be downloaded again. Local inference may use significant battery and memory, and availability and output quality vary by device and model. Applicable third-party model licenses govern the model files; these Terms do not override those licenses.

S A P O is not a professional advice service, emergency service, legal service, medical service, financial service, or safety-critical system.

We may change features, models, supported languages, and availability for reasons such as security, compatibility, legal requirements, or service improvements. Material changes to paid services are subject to the notice, consent, cancellation, and remedy protections in sections 4, 13, and 15 and applicable law.

---

## 3. Accounts And Sign-In

Online translation, respelling, and account-based subscription features require sign-in. Local translation can be used without an account once a supported model is downloaded and loaded. The current app does not create new anonymous SAPO accounts. Restricted demo access may be provided for review or testing; do not enter personal or confidential content in a shared demo account.

You may sign in with supported providers such as Google or Apple. You agree to provide accurate information where required, keep your account secure, and not share your account or use another person's account without permission.

You are responsible for activity under your account except where we are at fault. If you believe your account has been compromised, contact **support@sapo.surf** promptly.

---

## 4. Subscriptions, Billing, And Limits

S A P O offers a paid **Polyglot** subscription through supported subscription providers, such as Apple App Store or Google Play, with RevenueCat used for subscription management.

Payments, billing, subscription purchases, renewals, cancellations, taxes, refunds, and payment credentials are handled by the subscription provider, not directly by S A P O. Their terms and privacy policies apply to those payment and billing activities. S A P O receives limited subscription metadata needed to provide and manage your entitlement.

The purchase screen identifies the subscription, included features, price, currency, billing period, and any trial or introductory offer before you confirm. Payment is charged to your store account on confirmation, or as stated for an applicable trial. Unless that screen states otherwise, subscriptions renew automatically until canceled. For Apple subscriptions, cancel at least 24 hours before the end of the current period to avoid renewal; Apple may charge within the final 24 hours. For Google Play, cancel before the renewal date shown by Google. Any free trial converts to the disclosed paid subscription unless canceled within the store's deadline; eligibility and any forfeiture of an unused trial on purchase are governed by the offer and store rules.

Manage or cancel through **Settings > Manage subscription** where available, [Apple subscriptions](https://apps.apple.com/account/subscriptions), or [Google Play subscriptions](https://play.google.com/store/account/subscriptions). Cancellation ordinarily takes effect at the end of the paid period; trial access may end sooner under store rules. Use **Restore purchases** in the app with the relevant store and SAPO accounts if access needs to be restored.

Deleting the app or deleting your S A P O account does not delete, manage, or cancel an active subscription. You must cancel or manage subscriptions through the subscription provider. Refunds, credits, and billing disputes are handled by the subscription provider unless applicable law or app store rules require otherwise.

Current default **cloud** limits are:

| Plan     | Per-translation request input limit | Per-respelling request input limit | Monthly translation input limit | Monthly respelling input limit |
| -------- | ----------------------------------: | ---------------------------------: | ------------------------------: | -----------------------------: |
| Free     |                      500 characters |                       Not included |                5,000 characters |                   Not included |
| Polyglot |                   10,000 characters |                   2,000 characters |              500,000 characters |             100,000 characters |

Local translation currently has a **2,000-character per-request limit**, with no cloud monthly quota charge. Cloud limits count input characters rather than output characters or AI tokens; some displayed symbols contain multiple counted characters. Free cloud quota uses an account-anchored monthly window, and paid quota uses the applicable subscription billing-cycle window. Unused quota does not roll over unless expressly stated. Technical and proportionate abuse-prevention limits may also apply.

The offer shown before purchase establishes your purchased plan and billing terms. Backend records are used to administer access, not to override your purchase or statutory rights. Contact support if the app, store, and entitlement records disagree. Material price or paid-feature changes will receive legally required advance notice and any required consent; you can cancel before a change takes effect. We will provide any remedy required by law if a change materially reduces a service you have already paid for.

Mandatory cancellation, withdrawal, conformity, repair, price-reduction, and refund rights remain available. In jurisdictions with a cooling-off period, including qualifying EEA/UK distance contracts, any early start of digital supply or loss of a withdrawal right applies only after the required express request, consent, and acknowledgment under applicable law. These Terms do not themselves waive those rights. Contact the store or support for help exercising them.

A store subscription may be linked to only one S A P O account at a time. If your subscription is already linked to another S A P O account, you may need to sign in to that account, restore purchases there, or contact support.

---

## 5. Account Deletion

Authenticated users can request account deletion in the app through **Settings > Data controls > Delete account**. S A P O sends a verification email before deleting the account.

To complete account deletion, you must open the email deletion link on the device where S A P O is installed and where you are signed in to the S A P O account that requested deletion. If you open the link on another device, in a browser, while signed out, or while signed in to a different account, deletion may not complete.

You can also request deletion outside the app through our [Delete account page](/delete-account) or by emailing [support@sapo.surf](mailto:support@sapo.surf) with the subject **SAPO Account Deletion** and your account email. This route is available without reinstalling the app; proportionate identity verification may be required. You do not have to cancel a subscription before requesting deletion, although you should manage store billing separately to avoid further charges.

Deleting your S A P O account does not delete or cancel an active subscription. You must manage or cancel subscriptions through the subscription provider, such as Apple through Apple account settings or Google through Google Play settings.

Account deletion may take time because S A P O must confirm authentication deletion, stop in-flight work, process retries, and coordinate with service providers. We may preserve limited records where necessary for subscription integrity, fraud prevention, legal compliance, dispute resolution, security, or deletion retry/recovery, as explained in the [Privacy Policy](/privacy-policy).

---

## 6. Your Content And Privacy

**Your Content** means text or other material you submit to S A P O for translation or respelling.

You retain your rights in Your Content. You grant S A P O and the providers involved in your requested feature a limited, worldwide, non-exclusive, royalty-free license to process Your Content only to provide that feature and handle necessary security, troubleshooting, and legal obligations as described in the [Privacy Policy](/privacy-policy). This is not a license to sell or publish Your Content, train SAPO-owned AI models with it, or use it for unrelated product development. The license lasts only as long as required for these purposes and lawful retention. It does not replace any required privacy consent or legal basis.

Do not submit content unless you have the right to do so. Do not submit passwords, payment credentials, government identifiers, health records, biometric information, or other highly sensitive information to cloud features. Remove unnecessary personal information. Entering sensitive data does not itself constitute explicit consent to special-category processing. We do not promise zero retention by cloud providers; the Privacy Policy explains gateway logs, provider retention, and local processing.

The [Privacy Policy](/privacy-policy) explains how S A P O collects, uses, shares, stores, and deletes personal data. If these Terms conflict with the [Privacy Policy](/privacy-policy) about privacy or data protection, the [Privacy Policy](/privacy-policy) and applicable law control for that issue.

---

## 7. Open Phonetic Database

A portion of S A P O's revenue will be used to develop an open phonetic database containing mappings of phonetic respellings from every language to every language. The dataset will be developed by S A P O.

This does not give you ownership, governance, revenue, or approval rights in the database, S A P O, Happ Technologies, or any related intellectual property. S A P O may decide the development schedule, technical structure, release process, and open license or access terms for the database.

Unless S A P O provides a separate contribution feature, obtains required consent, or uses data that has been de-identified or aggregated so it no longer identifies you, text you submit in the app is not treated as a public database contribution.

---

## 8. Acceptable Use

You agree not to use S A P O to:

- Violate any law, regulation, sanctions rule, export control, court order, or third-party right.
- Submit content that is illegal, abusive, threatening, defamatory, hateful, exploitative, or harmful.
- Infringe or misappropriate intellectual property, privacy, publicity, or other rights.
- Submit content you do not have the right to submit.
- Use S A P O as a sole or primary source for medical, legal, financial, tax, emergency, safety-critical, or other professional decisions.
- Probe, scan, test, bypass, or undermine the security or access controls of S A P O without written permission.
- Abuse, overload, scrape, crawl, automate, resell, or commercially exploit the Service except as expressly allowed by us.
- Bypass, manipulate, or evade quotas, rate limits, subscription checks, purchase validation, or account restrictions.
- Reverse engineer, extract, or attempt to obtain model weights, prompts, proprietary systems, credentials, or non-public source material except where applicable law expressly allows.
- Use S A P O to build a competing service in a way that violates these Terms or applicable law.

We may suspend, limit, or terminate access if we reasonably believe you violated these Terms, created security or legal risk, abused subscriptions or refunds, or if we are required to do so by law, app store rules, or a service provider.

You may report harmful or unlawful output or other concerns to [support@sapo.surf](mailto:support@sapo.surf). Include only the context needed to investigate and avoid unnecessary personal information.

---

## 9. AI Output

S A P O output may be inaccurate, incomplete, offensive, unexpected, or unsuitable for your purpose. You are responsible for reviewing and deciding how to use output.

S A P O does not provide professional advice and does not guarantee that output is correct, unique, lawful to use in every context, or free from third-party rights. Do not rely on S A P O output for legal, medical, financial, emergency, safety-critical, or other high-risk decisions.

As between you and S A P O, and subject to these Terms, you may use output returned to you by the Service. You are responsible for ensuring that your use of output complies with applicable law and third-party rights.

---

## 10. Intellectual Property And Open Source

Except for Your Content and third-party materials, Happ Technologies and its licensors own all rights, title, and interest in S A P O, including the app, backend services, designs, logos, trademarks, software, documentation, and related technology.

For copies downloaded through the Apple App Store, the Apple Standard EULA governs your license to install and use the app. For other copies, subject to these Terms, we grant you a limited, non-exclusive, non-transferable license to install and use the app on devices you own or control for its intended purposes, subject to applicable store usage rules and any mandatory rights under law. Open-source software and model licenses remain applicable to their respective materials.

**S A P O**, **SAPO**, associated logos, and related brand elements are trademarks or trade dress of Happ Technologies or its affiliates. You may not use our names, logos, or marks in a way that suggests endorsement, sponsorship, or affiliation without our prior written consent.

Certain S A P O source code may be made available under open-source licenses, such as the license published in the applicable repository. Those licenses govern your use of that source code. These Terms govern your use of the deployed Service, accounts, subscriptions, backend services, and hosted functionality. If an open-source license conflicts with these Terms for the licensed source code itself, the open-source license controls for that source code.

---

## 11. Third-Party Services

S A P O relies on third-party services, including app stores, sign-in providers, subscription providers, RevenueCat, backend and infrastructure providers, email providers, and server-side AI model provider(s). Third-party services have their own terms, privacy policies, availability, security, and data practices.

You must comply with applicable third-party terms when using the Service, including your store and network-provider agreements. Review the terms and privacy policies of third-party services you use. Their involvement does not exclude our own obligations for the Service, our choice of processors, or any responsibility imposed by applicable law.

---

## 12. Apple Standard EULA And App Store Terms

If you download S A P O through the Apple App Store, your license to the app is governed by [Apple's Standard End User License Agreement](https://www.apple.com/legal/internet-services/itunes/dev/stdeula/). SAPO uses that standard agreement rather than a custom App Store EULA. For SAPO, Happ Technologies is the Application Provider under that agreement.

The Apple Standard EULA governs the app license, including its scope and the license-related rights and obligations it specifies. These Terms govern your relationship with Happ Technologies for SAPO's accounts, cloud translation and respelling, subscriptions, websites, and support. If these Terms conflict with the Apple Standard EULA concerning the App Store app license, the Apple Standard EULA controls. Nothing in these Terms limits mandatory consumer rights or changes Apple's applicable store terms.

Happ Technologies operates SAPO and provides service support at [support@sapo.surf](mailto:support@sapo.surf). Apple is not a party to these supplemental service Terms. App Store purchases, billing, and refunds remain subject to Apple's applicable terms and mandatory law, as described in section 4.

---

## 13. Termination

You may stop using S A P O at any time. You may also request account deletion as described in the [Privacy Policy](/privacy-policy) and these Terms.

We may suspend, terminate, or limit the Service or your access to it if you breach these Terms, create risk, misuse subscriptions or refunds, violate law, or if continued operation is no longer commercially, technically, legally, or operationally reasonable.

Where reasonably possible and lawful, we will explain the reason and provide notice and an opportunity to resolve the issue. Immediate action may be necessary for serious abuse, security, or legal requirements. You may ask support to review an account restriction. If we discontinue a paid service or end your access without your breach, we will provide the notice and refund or other remedy required by applicable law. Termination does not remove your privacy rights or cancel store billing automatically.

Termination does not affect rights or obligations that accrued before termination or that by their nature should survive, including intellectual property, payment, disclaimers, limitation of liability, dispute, and account deletion provisions.

---

## 14. Disclaimers And Limitation Of Liability

To the maximum extent permitted by law, S A P O is provided **as is** and **as available**, without warranties of any kind, whether express, implied, or statutory, including implied warranties of merchantability, fitness for a particular purpose, title, non-infringement, availability, accuracy, reliability, or security.

To the maximum extent permitted by law, Happ Technologies Inc. and its officers, directors, employees, contractors, affiliates, licensors, and service providers will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, lost revenue, lost goodwill, lost data, business interruption, or substitute services, arising out of or relating to S A P O or these Terms.

To the maximum extent permitted by law, our total aggregate liability for all claims arising out of or relating to S A P O or these Terms will be limited to the amount you paid to access S A P O during the three months immediately before the event giving rise to the claim.

Nothing in these Terms excludes or limits liability that cannot lawfully be excluded or limited, including applicable liability for fraud, willful misconduct, gross negligence, death or personal injury caused by negligence, or statutory consumer or data-protection rights. The exclusions and cap above do not apply to the extent prohibited by your local law. Consumers retain mandatory guarantees and remedies, including under applicable EEA/UK digital-content laws and the Australian Consumer Law; an "as is" statement does not remove those guarantees.

---

## 15. Changes To These Terms Or The Service

We may update these Terms for changes to features, providers, subscriptions, legal requirements, or app store rules. We will update the Effective Date and give reasonable advance notice of material changes through an appropriate service notice, email, or other available channel where required. Urgent security or legal changes may take effect sooner where lawful. Changes do not retroactively remove accrued rights or remedies.

Where permitted by law, continued use after proper notice and the effective date constitutes acceptance. Where affirmative agreement is required, we will obtain it separately. If you reject a material change, you may stop using the Service, cancel renewal, and exercise any applicable refund or termination rights. Changes to data processing remain subject to the Privacy Policy and any required separate consent.

---

## 16. Governing Law And Disputes

These Terms are governed by the laws of the State of Delaware, USA, without regard to conflict-of-law rules, except where the laws of your country of residence require a different choice of law for consumer protection reasons.

Please contact **support@sapo.surf** to try to resolve a dispute informally. Doing so is not a prerequisite to exercising statutory rights, contacting a regulator, seeking urgent relief, or filing within a legal deadline. Claims may be brought in courts with jurisdiction over your place of residence where required by mandatory consumer protection law, or otherwise in the state or federal courts located in Delaware, USA. Choosing Delaware law does not deprive consumers of mandatory protections where they habitually reside.

These Terms do not require mandatory arbitration or waive rights to collective, representative, or class proceedings available under applicable law.

---

## 17. Other Terms

- **Entire agreement.** These Terms govern your agreement with Happ Technologies about the Service, alongside the Apple Standard EULA for App Store app licenses and any applicable open-source or model licenses. The [Privacy Policy](/privacy-policy) explains our data practices. The Apple Standard EULA takes precedence for App Store app-license issues as described in section 12.
- **Severability.** If any part of these Terms is invalid or unenforceable, the rest remains in effect.
- **No waiver.** Our failure to enforce a provision is not a waiver of our right to enforce it later.
- **Assignment.** You may not transfer these Terms without our prior written consent. We may transfer these Terms in connection with a merger, acquisition, financing, reorganization, sale of assets, or similar transaction, subject to applicable law.
- **No third-party beneficiaries.** These supplemental service Terms do not create third-party beneficiary rights unless they expressly say otherwise. This does not alter any rights under the Apple Standard EULA.

---

## 18. Contact

Questions about these Terms or S A P O: **support@sapo.surf**

Privacy requests must be submitted as described in the **[S A P O Privacy Policy](/privacy-policy)**.
