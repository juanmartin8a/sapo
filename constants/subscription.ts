export const SUBSCRIPTION_LINKED_ELSEWHERE_ALERT_TITLE = "Subscription linked elsewhere";

export function getStoreAccountLabel(platform: string): string {
    if (platform === "android") {
        return "Google";
    }

    return platform === "ios" ? "Apple" : "store";
}

export function getSubscriptionLinkedElsewhereMessage(storeAccountLabel: string): string {
    return `This ${storeAccountLabel} account already has a S A P O subscription linked to another S A P O account. Please sign in to that account, or contact us for support at support@sapo.surf.`;
}
