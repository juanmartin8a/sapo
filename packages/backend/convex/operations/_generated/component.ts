/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    operationalAlerts: {
      deleteResolvedOperationalAlertsEligibleForRetentionPurge: FunctionReference<
        "mutation",
        "internal",
        { limit: number; older_than_ms: number },
        { deleted_count: number; scanned_count: number },
        Name
      >;
      listOpenOperationalAlerts: FunctionReference<
        "query",
        "internal",
        { limit?: number },
        Array<{
          _creationTime: number;
          _id: string;
          entity_key: string;
          first_seen_at_ms: number;
          kind: string;
          last_error?: string;
          last_seen_at_ms: number;
          message: string;
          next_notify_at_ms?: number;
          notified_at_ms?: number;
          occurrence_count: number;
          resolved_at_ms?: number;
          severity: "warning" | "error" | "critical";
          status: "open" | "acknowledged" | "resolved";
          title: string;
        }>,
        Name
      >;
      markOperationalAlertNotified: FunctionReference<
        "mutation",
        "internal",
        { alert_id: string; now_ms: number },
        null,
        Name
      >;
      recordOperationalAlert: FunctionReference<
        "mutation",
        "internal",
        {
          entity_key: string;
          kind: string;
          last_error?: string;
          message: string;
          now_ms: number;
          severity: "warning" | "error" | "critical";
          title: string;
        },
        { alert_id: string; should_notify: boolean },
        Name
      >;
    };
  };
