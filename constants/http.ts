export const POST_OPTIONS_METHODS = "POST, OPTIONS";
export const SAPOPINGUINO_STREAM_CACHE_CONTROL = "no-cache, no-transform";
export const KEEP_ALIVE_CONNECTION = "keep-alive";

export const HTTP_ROUTES = {
    SAPOPINGUINO_RESPELL: "/sapopinguino",
    SAPOPINGUINO_TRANSLATE: "/sapopinguino-translate",
    SUBSCRIPTION_RECONCILIATION: "/subscription/reconcile",
    RESEND_WEBHOOK: "/webhooks/resend",
    REVENUECAT_WEBHOOK: "/webhooks/revenuecat",
} as const;
