/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as anonymousMerge from "../anonymousMerge.js";
import type * as subscriptionWindows from "../subscriptionWindows.js";
import type * as userDeletionFinalization from "../userDeletionFinalization.js";
import type * as userDeletionUsageEvents from "../userDeletionUsageEvents.js";
import type * as webhook from "../webhook.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  anonymousMerge: typeof anonymousMerge;
  subscriptionWindows: typeof subscriptionWindows;
  userDeletionFinalization: typeof userDeletionFinalization;
  userDeletionUsageEvents: typeof userDeletionUsageEvents;
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
