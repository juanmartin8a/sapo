/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as model_documents from "../model/documents.js";
import type * as model_leaseOwnership from "../model/leaseOwnership.js";
import type * as model_planLimits from "../model/planLimits.js";
import type * as model_quotaAvailability from "../model/quotaAvailability.js";
import type * as model_quotaPeriodCounters from "../model/quotaPeriodCounters.js";
import type * as model_revenueCatEventUserDocuments from "../model/revenueCatEventUserDocuments.js";
import type * as model_subscriptionWindows from "../model/subscriptionWindows.js";
import type * as model_usageEventLifecycle from "../model/usageEventLifecycle.js";
import type * as model_usageRateLimit from "../model/usageRateLimit.js";
import type * as model_userDeletionQueueDocuments from "../model/userDeletionQueueDocuments.js";
import type * as model_userDeletionRevenueCatEvents from "../model/userDeletionRevenueCatEvents.js";
import type * as model_webhook from "../model/webhook.js";
import type * as validators_webhook from "../validators/webhook.js";
import type * as webhook from "../webhook.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  "model/documents": typeof model_documents;
  "model/leaseOwnership": typeof model_leaseOwnership;
  "model/planLimits": typeof model_planLimits;
  "model/quotaAvailability": typeof model_quotaAvailability;
  "model/quotaPeriodCounters": typeof model_quotaPeriodCounters;
  "model/revenueCatEventUserDocuments": typeof model_revenueCatEventUserDocuments;
  "model/subscriptionWindows": typeof model_subscriptionWindows;
  "model/usageEventLifecycle": typeof model_usageEventLifecycle;
  "model/usageRateLimit": typeof model_usageRateLimit;
  "model/userDeletionQueueDocuments": typeof model_userDeletionQueueDocuments;
  "model/userDeletionRevenueCatEvents": typeof model_userDeletionRevenueCatEvents;
  "model/webhook": typeof model_webhook;
  "validators/webhook": typeof validators_webhook;
  webhook: typeof webhook;
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
> = anyApi as any;

export const components = componentsGeneric() as unknown as {};
