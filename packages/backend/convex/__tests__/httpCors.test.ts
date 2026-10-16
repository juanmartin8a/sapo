import { afterEach, describe, expect, it } from "@jest/globals";

import { buildCorsResponseHeaders, isAllowedCorsRequest } from "../model/http/cors";

const originalEnv = process.env;

function headersFor(request: Request) {
    return buildCorsResponseHeaders(request, {
        contentType: "application/json",
        allowedMethods: "POST, OPTIONS",
    });
}

describe("HTTP CORS headers", () => {
    afterEach(() => {
        process.env = originalEnv;
    });

    it("allows configured browser origins", () => {
        process.env = {
            ...originalEnv,
            CLIENT_ORIGIN: "https://app.example.com",
            NODE_ENV: "production",
        };

        const headers = headersFor(
            new Request("https://api.example.com", {
                headers: {
                    Origin: "https://app.example.com",
                },
            })
        );

        expect(headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
    });

    it("fails closed for browser origins in production when unconfigured", () => {
        process.env = {
            ...originalEnv,
            CLIENT_ORIGIN: undefined,
            NODE_ENV: "production",
            CONVEX_DEPLOYMENT: "prod:example",
        };

        const headers = headersFor(
            new Request("https://api.example.com", {
                headers: {
                    Origin: "https://evil.example.com",
                },
            })
        );

        expect(headers.has("Access-Control-Allow-Origin")).toBe(false);
        expect(
            isAllowedCorsRequest(
                new Request("https://api.example.com", {
                    headers: {
                        Origin: "https://evil.example.com",
                    },
                })
            )
        ).toBe(false);
    });

    it("fails closed for browser origins outside production too", () => {
        process.env = {
            ...originalEnv,
            CLIENT_ORIGIN: undefined,
            NODE_ENV: "development",
            CONVEX_DEPLOYMENT: "dev:example",
        };

        const request = new Request("https://api.example.com", {
            headers: {
                Origin: "https://app.example.com",
            },
        });
        const headers = headersFor(request);

        expect(headers.has("Access-Control-Allow-Origin")).toBe(false);
        expect(isAllowedCorsRequest(request)).toBe(false);
    });

    it("does not require CORS for native no-origin requests", () => {
        process.env = {
            ...originalEnv,
            CLIENT_ORIGIN: undefined,
            NODE_ENV: "production",
            CONVEX_DEPLOYMENT: "prod:example",
        };

        const headers = headersFor(new Request("https://api.example.com"));

        expect(headers.has("Access-Control-Allow-Origin")).toBe(false);
        expect(headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
        expect(isAllowedCorsRequest(new Request("https://api.example.com"))).toBe(true);
    });
});
