# Reviewer demo access

Demo access uses a reusable six-digit code and a normal Better Auth session. Google
and Apple remain the public sign-in providers; email/password sign-in is disabled.
The OTP input is only the code-entry UI: no email or SMS is sent.

## Setup

1. Deploy the backend changes to the deployment used by the review build using the
   repository's `bun run convex:deploy` command.
2. In that deployment's Convex dashboard, run the internal function
   `auth:provisionDemoUser` with `{}`. It creates an unverified `Demo Reviewer` user
   with `juanmarzabala8a@hotmail.com` and returns its Better Auth user ID. It refuses
   to modify an existing account with that email. If one already exists, inspect
   its data and ownership before explicitly choosing it for demo access.
3. Set **server-side** Convex environment variables in that deployment:
   - `DEMO_ACCESS_USER_ID`: the complete `userId` string returned by the setup
     function, without surrounding quotes. This is the demo user document’s `_id`
     in the **betterAuth component’s user table**, not its optional `userId` field,
     an account number, email, or a value you invent.
   - `DEMO_ACCESS_CODE`: a randomly chosen string of exactly six ASCII digits.
     Leading zeros are supported. Never put this value in Expo public variables,
     source control, logs, or the app bundle.
4. Build the client, open sign-in, tap **Demo access**, and enter the configured
   code. Confirm entry into the app, sign-out, and sign-in again on a device.
5. Put the code and these navigation instructions in App Store review notes.

The endpoint fails closed if either variable is missing, the code is malformed,
or the configured user no longer exists. The production database-backed auth
limiter allows five attempts per 15 minutes per client IP for this endpoint.
Requests without a trusted IP share Better Auth's fallback bucket.

The account has normal app permissions, quotas, purchases, and deletion behavior.
It is shared by anyone given the code; use it only for review data. No subscription
or entitlement is granted by this feature. Deleting this account requires running
setup again and replacing its user ID.

Rotate `DEMO_ACCESS_CODE` to change the reviewer credential. Removing the code
stops new demo sign-ins; existing sessions remain valid. Removing
`DEMO_ACCESS_USER_ID` also removes the backend authorization exception for demo
users without a social provider account and the production sandbox subscription
exception for that account on subsequent processing/reconciliation. Neither
operation changes other users.

Backend changes live in `packages/backend/convex`; commit them together with
related client changes in the monorepo.

## Invalid ID configuration

If logs report `Unable to decode ID: Invalid ID length 2`, the configured user ID
is not a Convex document ID. In the same deployment, select the **betterAuth**
component, open its **user** table, locate `juanmarzabala8a@hotmail.com`, and copy
that row's complete `_id` into `DEMO_ACCESS_USER_ID`. If no user exists, run
`auth:provisionDemoUser` with `{}` first. Leave `DEMO_ACCESS_CODE` unchanged.
The endpoint now uses the email index and compares the returned ID, so malformed
configuration cannot be passed into `db.get` or grant access to another user.
