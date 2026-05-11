export type UsageEventState =
    | "reserved"
    | "processing"
    | "completed"
    | "failed_before_charge"
    | "failed_after_charge"
    | "user_stopped_before_charge"
    | "user_stopped_after_charge";

export function canTransitionUsageEventToAfterChargeTerminalState(args: {
    state: UsageEventState;
    is_charged: boolean;
}) {
    return args.is_charged && args.state === "processing";
}
