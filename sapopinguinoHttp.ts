import { httpAction } from "./_generated/server";
import { authenticatedHttpAction } from "./lib/httpAuth";
import {
    handleSapopinguinoOptionsRequest,
    handleSapopinguinoRequest,
    responseHeaders,
} from "./model/sapopinguino/respellHttp";

export const sapopinguinoOptions = httpAction(handleSapopinguinoOptionsRequest);

export const sapopinguino = authenticatedHttpAction(handleSapopinguinoRequest, responseHeaders);
