import { httpAction } from "./_generated/server";
import { authenticatedHttpAction } from "./model/http/auth";
import {
    handleSapopinguinoTranslateOptionsRequest,
    handleSapopinguinoTranslateRequest,
    responseHeaders,
} from "./model/sapopinguino/translateHttp";

export const sapopinguinoTranslateOptions = httpAction(
    handleSapopinguinoTranslateOptionsRequest
);

export const sapopinguinoTranslate = authenticatedHttpAction(
    handleSapopinguinoTranslateRequest,
    responseHeaders
);
