import { mutation, query } from "./_generated/server";
import * as OperationalAlerts from "./model/operationalAlerts";
import * as OperationalAlertArgs from "./validators/operationalAlerts";

export const recordOperationalAlert = mutation({
    args: OperationalAlertArgs.recordOperationalAlertArgs,
    returns: OperationalAlertArgs.recordOperationalAlertReturns,
    handler: OperationalAlerts.recordOperationalAlert,
});

export const markOperationalAlertNotified = mutation({
    args: OperationalAlertArgs.markOperationalAlertNotifiedArgs,
    returns: OperationalAlertArgs.markOperationalAlertNotifiedReturns,
    handler: OperationalAlerts.markOperationalAlertNotified,
});

export const listOpenOperationalAlerts = query({
    args: OperationalAlertArgs.listOpenOperationalAlertsArgs,
    returns: OperationalAlertArgs.listOpenOperationalAlertsReturns,
    handler: OperationalAlerts.listOpenOperationalAlerts,
});

export const deleteResolvedOperationalAlertsEligibleForRetentionPurge = mutation({
    args: OperationalAlertArgs.deleteResolvedOperationalAlertsArgs,
    returns: OperationalAlertArgs.deleteResolvedOperationalAlertsReturns,
    handler: OperationalAlerts.deleteResolvedOperationalAlertsEligibleForRetentionPurge,
});
