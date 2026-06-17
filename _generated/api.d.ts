/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as httpAuth from "../httpAuth.js";
import type * as httpCors from "../httpCors.js";
import type * as httpRequestBody from "../httpRequestBody.js";
import type * as operationalAlerts from "../operationalAlerts.js";
import type * as refresh from "../refresh.js";
import type * as sapopinguinoHttp from "../sapopinguinoHttp.js";
import type * as sapopinguinoInput from "../sapopinguinoInput.js";
import type * as sapopinguinoQuota from "../sapopinguinoQuota.js";
import type * as sapopinguinoQuotaRecovery from "../sapopinguinoQuotaRecovery.js";
import type * as sapopinguinoTranslate from "../sapopinguinoTranslate.js";
import type * as sapopinguinoWorkers from "../sapopinguinoWorkers.js";
import type * as sendEmail from "../sendEmail.js";
import type * as subscriptionsConfig from "../subscriptionsConfig.js";
import type * as subscriptionsWebhook from "../subscriptionsWebhook.js";
import type * as subscriptionsWorkers from "../subscriptionsWorkers.js";
import type * as userDeletionQueue from "../userDeletionQueue.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  crons: typeof crons;
  http: typeof http;
  httpAuth: typeof httpAuth;
  httpCors: typeof httpCors;
  httpRequestBody: typeof httpRequestBody;
  operationalAlerts: typeof operationalAlerts;
  refresh: typeof refresh;
  sapopinguinoHttp: typeof sapopinguinoHttp;
  sapopinguinoInput: typeof sapopinguinoInput;
  sapopinguinoQuota: typeof sapopinguinoQuota;
  sapopinguinoQuotaRecovery: typeof sapopinguinoQuotaRecovery;
  sapopinguinoTranslate: typeof sapopinguinoTranslate;
  sapopinguinoWorkers: typeof sapopinguinoWorkers;
  sendEmail: typeof sendEmail;
  subscriptionsConfig: typeof subscriptionsConfig;
  subscriptionsWebhook: typeof subscriptionsWebhook;
  subscriptionsWorkers: typeof subscriptionsWorkers;
  userDeletionQueue: typeof userDeletionQueue;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
  sapopinguino: import("../sapopinguino/_generated/component.js").ComponentApi<"sapopinguino">;
  subscriptions: import("../subscriptions/_generated/component.js").ComponentApi<"subscriptions">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
};
