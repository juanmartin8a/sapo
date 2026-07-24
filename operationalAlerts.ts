import { internalAction } from "./_generated/server";
import * as OperationalAlerts from "./model/operationalAlerts";
import * as OperationalAlertArgs from "./operations/validators/operationalAlerts";

export const recordOperationalAlertAndNotify = internalAction({
    args: OperationalAlertArgs.recordOperationalAlertAndNotifyArgs,
    handler: OperationalAlerts.recordOperationalAlertAndNotify,
});

export const purgeResolvedOperationalAlerts = internalAction({
    args: {},
    handler: OperationalAlerts.purgeResolvedOperationalAlerts,
});
