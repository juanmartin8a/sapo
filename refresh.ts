import { httpAction } from "./_generated/server";
import { authenticatedHttpAction } from "./model/http/auth";
import {
    handleRefreshOptionsRequest,
    handleRefreshRequest,
    responseHeaders,
} from "./model/http/refresh";

export const refreshOptions = httpAction(handleRefreshOptionsRequest);

export const refresh = authenticatedHttpAction(handleRefreshRequest, responseHeaders);
