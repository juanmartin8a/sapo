import { httpAction } from "./_generated/server";
import { authenticatedHttpAction } from "./lib/httpAuth";
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
