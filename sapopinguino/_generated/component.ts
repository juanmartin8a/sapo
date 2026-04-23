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
    streamControl: {
      clearStreamControl: FunctionReference<
        "mutation",
        "internal",
        {
          operation: "translate" | "respell";
          streamId: string;
          userId: string;
        },
        any,
        Name
      >;
      consumeStreamControlAction: FunctionReference<
        "mutation",
        "internal",
        {
          operation: "translate" | "respell";
          streamId: string;
          userId: string;
        },
        any,
        Name
      >;
      deleteUserStreamControls: FunctionReference<
        "mutation",
        "internal",
        { userId: string },
        any,
        Name
      >;
      getStreamControlStatus: FunctionReference<
        "query",
        "internal",
        {
          operation: "translate" | "respell";
          streamId: string;
          userId: string;
        },
        any,
        Name
      >;
      registerStreamControl: FunctionReference<
        "mutation",
        "internal",
        {
          nowMs: number;
          operation: "translate" | "respell";
          streamId: string;
          userId: string;
        },
        any,
        Name
      >;
      requestStreamStop: FunctionReference<
        "mutation",
        "internal",
        {
          nowMs: number;
          operation: "translate" | "respell";
          streamId: string;
          userId: string;
        },
        any,
        Name
      >;
      requestUserStreamStops: FunctionReference<
        "mutation",
        "internal",
        { nowMs: number; userId: string },
        any,
        Name
      >;
    };
  };
