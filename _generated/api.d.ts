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
import type * as constants_app from "../constants/app.js";
import type * as constants_demoAccess from "../constants/demoAccess.js";
import type * as constants_errors from "../constants/errors.js";
import type * as constants_http from "../constants/http.js";
import type * as constants_limits from "../constants/limits.js";
import type * as constants_operationalAlerts from "../constants/operationalAlerts.js";
import type * as constants_revenueCat from "../constants/revenueCat.js";
import type * as constants_sapopinguino from "../constants/sapopinguino.js";
import type * as constants_subscriptions from "../constants/subscriptions.js";
import type * as constants_time from "../constants/time.js";
import type * as constants_userDeletion from "../constants/userDeletion.js";
import type * as crons from "../crons.js";
import type * as email from "../email.js";
import type * as http from "../http.js";
import type * as lib_httpAuth from "../lib/httpAuth.js";
import type * as model_auth from "../model/auth.js";
import type * as model_email from "../model/email.js";
import type * as model_emailConfig from "../model/emailConfig.js";
import type * as model_errors from "../model/errors.js";
import type * as model_http_cors from "../model/http/cors.js";
import type * as model_http_requestBody from "../model/http/requestBody.js";
import type * as model_http_responses from "../model/http/responses.js";
import type * as model_http_subscriptionReconciliation from "../model/http/subscriptionReconciliation.js";
import type * as model_operationalAlerts from "../model/operationalAlerts.js";
import type * as model_pronunciations from "../model/pronunciations.js";
import type * as model_sapopinguino_abortableStream from "../model/sapopinguino/abortableStream.js";
import type * as model_sapopinguino_cloudflareAi from "../model/sapopinguino/cloudflareAi.js";
import type * as model_sapopinguino_input from "../model/sapopinguino/input.js";
import type * as model_sapopinguino_languages from "../model/sapopinguino/languages.js";
import type * as model_sapopinguino_quota from "../model/sapopinguino/quota.js";
import type * as model_sapopinguino_quotaHttp from "../model/sapopinguino/quotaHttp.js";
import type * as model_sapopinguino_quotaStream from "../model/sapopinguino/quotaStream.js";
import type * as model_sapopinguino_requestPreparation from "../model/sapopinguino/requestPreparation.js";
import type * as model_sapopinguino_respellHttp from "../model/sapopinguino/respellHttp.js";
import type * as model_sapopinguino_respellPipeline from "../model/sapopinguino/respellPipeline.js";
import type * as model_sapopinguino_streamOutput from "../model/sapopinguino/streamOutput.js";
import type * as model_sapopinguino_tokenParser from "../model/sapopinguino/tokenParser.js";
import type * as model_sapopinguino_translateHttp from "../model/sapopinguino/translateHttp.js";
import type * as model_sapopinguino_translationPreviewParser from "../model/sapopinguino/translationPreviewParser.js";
import type * as model_subscription from "../model/subscription.js";
import type * as model_subscriptions_componentApi from "../model/subscriptions/componentApi.js";
import type * as model_subscriptions_config from "../model/subscriptions/config.js";
import type * as model_subscriptions_revenueCatApi from "../model/subscriptions/revenueCatApi.js";
import type * as model_subscriptions_revenueCatEnvironment from "../model/subscriptions/revenueCatEnvironment.js";
import type * as model_subscriptions_revenueCatEventUsers from "../model/subscriptions/revenueCatEventUsers.js";
import type * as model_subscriptions_revenueCatWebhook from "../model/subscriptions/revenueCatWebhook.js";
import type * as model_subscriptions_revenueCatWebhookHttp from "../model/subscriptions/revenueCatWebhookHttp.js";
import type * as model_subscriptions_revenueCatWebhookIngestion from "../model/subscriptions/revenueCatWebhookIngestion.js";
import type * as model_subscriptions_revenueCatWebhookPayload from "../model/subscriptions/revenueCatWebhookPayload.js";
import type * as model_subscriptions_userDeletionQueue from "../model/subscriptions/userDeletionQueue.js";
import type * as model_subscriptions_workers from "../model/subscriptions/workers.js";
import type * as model_valueParsing from "../model/valueParsing.js";
import type * as operationalAlerts from "../operationalAlerts.js";
import type * as pronunciations from "../pronunciations.js";
import type * as sapopinguinoHttp from "../sapopinguinoHttp.js";
import type * as sapopinguinoTranslate from "../sapopinguinoTranslate.js";
import type * as subscription from "../subscription.js";
import type * as subscriptionReconciliation from "../subscriptionReconciliation.js";
import type * as subscriptionsWebhook from "../subscriptionsWebhook.js";
import type * as subscriptionsWorkers from "../subscriptionsWorkers.js";
import type * as validators_subscriptionsWorkers from "../validators/subscriptionsWorkers.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  "constants/app": typeof constants_app;
  "constants/demoAccess": typeof constants_demoAccess;
  "constants/errors": typeof constants_errors;
  "constants/http": typeof constants_http;
  "constants/limits": typeof constants_limits;
  "constants/operationalAlerts": typeof constants_operationalAlerts;
  "constants/revenueCat": typeof constants_revenueCat;
  "constants/sapopinguino": typeof constants_sapopinguino;
  "constants/subscriptions": typeof constants_subscriptions;
  "constants/time": typeof constants_time;
  "constants/userDeletion": typeof constants_userDeletion;
  crons: typeof crons;
  email: typeof email;
  http: typeof http;
  "lib/httpAuth": typeof lib_httpAuth;
  "model/auth": typeof model_auth;
  "model/email": typeof model_email;
  "model/emailConfig": typeof model_emailConfig;
  "model/errors": typeof model_errors;
  "model/http/cors": typeof model_http_cors;
  "model/http/requestBody": typeof model_http_requestBody;
  "model/http/responses": typeof model_http_responses;
  "model/http/subscriptionReconciliation": typeof model_http_subscriptionReconciliation;
  "model/operationalAlerts": typeof model_operationalAlerts;
  "model/pronunciations": typeof model_pronunciations;
  "model/sapopinguino/abortableStream": typeof model_sapopinguino_abortableStream;
  "model/sapopinguino/cloudflareAi": typeof model_sapopinguino_cloudflareAi;
  "model/sapopinguino/input": typeof model_sapopinguino_input;
  "model/sapopinguino/languages": typeof model_sapopinguino_languages;
  "model/sapopinguino/quota": typeof model_sapopinguino_quota;
  "model/sapopinguino/quotaHttp": typeof model_sapopinguino_quotaHttp;
  "model/sapopinguino/quotaStream": typeof model_sapopinguino_quotaStream;
  "model/sapopinguino/requestPreparation": typeof model_sapopinguino_requestPreparation;
  "model/sapopinguino/respellHttp": typeof model_sapopinguino_respellHttp;
  "model/sapopinguino/respellPipeline": typeof model_sapopinguino_respellPipeline;
  "model/sapopinguino/streamOutput": typeof model_sapopinguino_streamOutput;
  "model/sapopinguino/tokenParser": typeof model_sapopinguino_tokenParser;
  "model/sapopinguino/translateHttp": typeof model_sapopinguino_translateHttp;
  "model/sapopinguino/translationPreviewParser": typeof model_sapopinguino_translationPreviewParser;
  "model/subscription": typeof model_subscription;
  "model/subscriptions/componentApi": typeof model_subscriptions_componentApi;
  "model/subscriptions/config": typeof model_subscriptions_config;
  "model/subscriptions/revenueCatApi": typeof model_subscriptions_revenueCatApi;
  "model/subscriptions/revenueCatEnvironment": typeof model_subscriptions_revenueCatEnvironment;
  "model/subscriptions/revenueCatEventUsers": typeof model_subscriptions_revenueCatEventUsers;
  "model/subscriptions/revenueCatWebhook": typeof model_subscriptions_revenueCatWebhook;
  "model/subscriptions/revenueCatWebhookHttp": typeof model_subscriptions_revenueCatWebhookHttp;
  "model/subscriptions/revenueCatWebhookIngestion": typeof model_subscriptions_revenueCatWebhookIngestion;
  "model/subscriptions/revenueCatWebhookPayload": typeof model_subscriptions_revenueCatWebhookPayload;
  "model/subscriptions/userDeletionQueue": typeof model_subscriptions_userDeletionQueue;
  "model/subscriptions/workers": typeof model_subscriptions_workers;
  "model/valueParsing": typeof model_valueParsing;
  operationalAlerts: typeof operationalAlerts;
  pronunciations: typeof pronunciations;
  sapopinguinoHttp: typeof sapopinguinoHttp;
  sapopinguinoTranslate: typeof sapopinguinoTranslate;
  subscription: typeof subscription;
  subscriptionReconciliation: typeof subscriptionReconciliation;
  subscriptionsWebhook: typeof subscriptionsWebhook;
  subscriptionsWorkers: typeof subscriptionsWorkers;
  "validators/subscriptionsWorkers": typeof validators_subscriptionsWorkers;
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
  operations: import("../operations/_generated/component.js").ComponentApi<"operations">;
  subscriptions: import("../subscriptions/_generated/component.js").ComponentApi<"subscriptions">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
};
