export type ForcedStoppedUsageEventTransition =
    | {
          state: "user_stopped_before_charge";
          stopped_at_ms: number;
          updated_at_ms: number;
      }
    | {
          state: "user_stopped_after_charge";
          charged_units: number;
          charged_at_ms: number;
          stopped_at_ms: number;
          updated_at_ms: number;
      };

export function resolveForcedStoppedUsageEventTransition(args: {
    state: "reserved" | "processing";
    held_units: number;
    is_charged: boolean;
    charged_at_ms?: number;
    stopped_at_ms?: number;
    now_ms: number;
}): ForcedStoppedUsageEventTransition | null {
    if (args.state === "reserved") {
        return {
            state: "user_stopped_before_charge",
            stopped_at_ms: args.stopped_at_ms ?? args.now_ms,
            updated_at_ms: args.now_ms,
        };
    }

    if (!args.is_charged) {
        return null;
    }

    return {
        state: "user_stopped_after_charge",
        charged_units: args.held_units,
        charged_at_ms: args.charged_at_ms ?? args.now_ms,
        stopped_at_ms: args.stopped_at_ms ?? args.now_ms,
        updated_at_ms: args.now_ms,
    };
}
