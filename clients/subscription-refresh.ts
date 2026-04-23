import { authClient } from "@/clients/auth-client";

type RefreshSubscriptionResponse = {
    ok?: boolean;
    error?: string;
    refresh?: {
        error?: string;
    };
};

function getRefreshUrl() {
    const baseUrl = process.env.EXPO_PUBLIC_CONVEX_SITE_URL ?? "";

    if (baseUrl.length === 0) {
        throw new Error("Missing EXPO_PUBLIC_CONVEX_SITE_URL");
    }

    return `${baseUrl.replace(/\/$/, "")}/refresh`;
}

function getRefreshErrorMessage(
    response: RefreshSubscriptionResponse | null,
    responseText: string,
    status: number
) {
    if (typeof response?.error === "string" && response.error.trim().length > 0) {
        return response.error;
    }

    if (typeof response?.refresh?.error === "string" && response.refresh.error.trim().length > 0) {
        return response.refresh.error;
    }

    if (responseText.trim().length > 0) {
        return responseText.trim();
    }

    return `Subscription refresh failed with status ${status}`;
}

export async function refreshSubscriptionState() {
    const { data: convexTokenData } = await authClient.convex.token();
    const convexToken = convexTokenData?.token;

    if (!convexToken) {
        throw new Error("Unable to get Convex auth token");
    }

    const response = await fetch(getRefreshUrl(), {
        method: "POST",
        headers: {
            Accept: "application/json",
            Authorization: `Bearer ${convexToken}`,
        },
    });

    const responseText = await response.text();
    let parsedResponse: RefreshSubscriptionResponse | null = null;

    if (responseText.length > 0) {
        try {
            parsedResponse = JSON.parse(responseText) as RefreshSubscriptionResponse;
        } catch {
            parsedResponse = null;
        }
    }

    if (!response.ok || parsedResponse?.ok !== true) {
        throw new Error(getRefreshErrorMessage(parsedResponse, responseText, response.status));
    }
}
