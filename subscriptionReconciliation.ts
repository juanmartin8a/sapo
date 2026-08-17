import { httpAction } from "./_generated/server";
import { authenticatedHttpAction } from "./lib/httpAuth";
import {
    handleSubscriptionReconciliationOptionsRequest,
    handleSubscriptionReconciliationRequest,
    responseHeaders,
} from "./model/http/subscriptionReconciliation";

export const subscriptionReconciliationOptions = httpAction(
    handleSubscriptionReconciliationOptionsRequest
);

export const subscriptionReconciliation = authenticatedHttpAction(
    handleSubscriptionReconciliationRequest,
    responseHeaders
);
