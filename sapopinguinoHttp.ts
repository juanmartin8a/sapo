import { httpAction } from "./_generated/server";
import { authenticatedHttpAction } from "./model/http/auth";
import {
    handleSapopinguinoOptionsRequest,
    handleSapopinguinoRequest,
    responseHeaders,
} from "./model/sapopinguino/respellHttp";

export const sapopinguinoOptions = httpAction(handleSapopinguinoOptionsRequest);

export const sapopinguino = authenticatedHttpAction(handleSapopinguinoRequest, responseHeaders);
