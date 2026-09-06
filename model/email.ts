import { getEmailTestMode } from "./emailConfig";
import { components } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { Resend } from "@convex-dev/resend";

const EMAIL_FROM = "S A P O <donotreply@sapo.surf>";

const resend: Resend = new Resend(components.resend, {
    testMode: getEmailTestMode(),
});

export function handleResendWebhook(ctx: ActionCtx, request: Request) {
    return resend.handleResendEventWebhook(ctx, request);
}

export async function sendAccountDeletionVerificationEmail(
    ctx: ActionCtx,
    to: string,
    url: string,
) {
    return resend.sendEmail(ctx, {
        from: EMAIL_FROM,
        to,
        subject: "Verify Account Deletion",
        template: {
            id: "verify_account_deletion",
            variables: { URL: url },
        },
    });
}

export async function sendOperationalAlertEmail(
    ctx: ActionCtx,
    to: string,
    subject: string,
    text: string,
) {
    return resend.sendEmail(ctx, {
        from: EMAIL_FROM,
        to,
        subject,
        text,
    });
}
