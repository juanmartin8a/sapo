/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as documents from "../documents.js";
import type * as leaseOwnership from "../leaseOwnership.js";
import type * as planLimits from "../planLimits.js";
import type * as quotaAvailability from "../quotaAvailability.js";
import type * as quotaPeriodCounters from "../quotaPeriodCounters.js";
import type * as quotaRecovery from "../quotaRecovery.js";
import type * as revenueCatApi from "../revenueCatApi.js";
import type * as revenueCatEventUserDocuments from "../revenueCatEventUserDocuments.js";
import type * as revenueCatEventUsers from "../revenueCatEventUsers.js";
import type * as revenueCatWebhookHttp from "../revenueCatWebhookHttp.js";
import type * as revenueCatWebhookIngestion from "../revenueCatWebhookIngestion.js";
import type * as revenueCatWebhookPayload from "../revenueCatWebhookPayload.js";
import type * as subscriptionWindows from "../subscriptionWindows.js";
import type * as usageEventChargeApplication from "../usageEventChargeApplication.js";
import type * as usageEventTransitions from "../usageEventTransitions.js";
import type * as userDeletionQueueDocuments from "../userDeletionQueueDocuments.js";
import type * as userDeletionRevenueCatEvents from "../userDeletionRevenueCatEvents.js";
import type * as userDeletionUsageEvents from "../userDeletionUsageEvents.js";
import type * as webhook from "../webhook.js";
import type * as workersComponentApi from "../workersComponentApi.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  documents: typeof documents;
  leaseOwnership: typeof leaseOwnership;
  planLimits: typeof planLimits;
  quotaAvailability: typeof quotaAvailability;
  quotaPeriodCounters: typeof quotaPeriodCounters;
  quotaRecovery: typeof quotaRecovery;
  revenueCatApi: typeof revenueCatApi;
  revenueCatEventUserDocuments: typeof revenueCatEventUserDocuments;
  revenueCatEventUsers: typeof revenueCatEventUsers;
  revenueCatWebhookHttp: typeof revenueCatWebhookHttp;
  revenueCatWebhookIngestion: typeof revenueCatWebhookIngestion;
  revenueCatWebhookPayload: typeof revenueCatWebhookPayload;
  subscriptionWindows: typeof subscriptionWindows;
  usageEventChargeApplication: typeof usageEventChargeApplication;
  usageEventTransitions: typeof usageEventTransitions;
  userDeletionQueueDocuments: typeof userDeletionQueueDocuments;
  userDeletionRevenueCatEvents: typeof userDeletionRevenueCatEvents;
  userDeletionUsageEvents: typeof userDeletionUsageEvents;
  webhook: typeof webhook;
  workersComponentApi: typeof workersComponentApi;
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
