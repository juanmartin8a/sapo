export function shouldBlockQuotaUsageForPeriod(args: {
    used_chars: number;
    period_limit: number;
}) {
    const usedChars = Math.max(0, Math.floor(args.used_chars));
    const periodLimit = Math.max(0, Math.floor(args.period_limit));

    return usedChars >= periodLimit;
}
