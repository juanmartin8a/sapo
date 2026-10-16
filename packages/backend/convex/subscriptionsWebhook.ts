import { httpAction } from "./_generated/server";
import {
    handleRevenueCatWebhookOptionsRequest,
    handleRevenueCatWebhookRequest,
} from "./model/subscriptions/revenueCatWebhook";

export const revenueCatWebhookOptions = httpAction(handleRevenueCatWebhookOptionsRequest);

export const revenueCatWebhook = httpAction(handleRevenueCatWebhookRequest);
