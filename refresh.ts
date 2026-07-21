import { httpAction } from "./_generated/server";
import { authenticatedHttpAction } from "./lib/httpAuth";
import {
    handleRefreshOptionsRequest,
    handleRefreshRequest,
    responseHeaders,
} from "./model/http/refresh";

export const refreshOptions = httpAction(handleRefreshOptionsRequest);

export const refresh = authenticatedHttpAction(handleRefreshRequest, responseHeaders);
