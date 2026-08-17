import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { reconcileObservedSubscriptionState } from "@/lib/subscription-reconciliation";

jest.mock("@/lib/auth-client", () => ({
    getConvexAccessToken: jest.fn(),
}));
jest.mock("@/lib/client-config", () => ({
    getRequiredConvexSiteUrl: () => "https://example.convex.site",
}));
const originalEnv = process.env;
const originalFetch = globalThis.fetch;

describe("subscription reconciliation client", () => {
    afterEach(() => {
        process.env = originalEnv;
        globalThis.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    it("sends the authenticated SDK observation", async () => {
        const fetchMock = jest.fn(async () => new Response(JSON.stringify({
            ok: true,
            status: "active",
            subscription: {
                has_active_subscription: true,
                plan_key: "polyglot",
            },
        }), { status: 200 })) as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;

        await expect(reconcileObservedSubscriptionState({
            userId: "user_1",
            observedActive: true,
            accessToken: "token_1",
        })).resolves.toMatchObject({ status: "active" });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe(
            "https://example.convex.site/subscription/reconcile"
        );
        expect(fetchMock.mock.calls[0][1]).toMatchObject({
            method: "POST",
            body: JSON.stringify({
                expected_user_id: "user_1",
                observed_active: true,
            }),
        });
    });

    it("shares an in-flight request for the same user and observation", async () => {
        let resolveFetch!: (response: Response) => void;
        globalThis.fetch = jest.fn(() => new Promise<Response>((resolve) => {
            resolveFetch = resolve;
        })) as typeof fetch;

        const options = {
            userId: "user_1",
            observedActive: false,
            accessToken: "token_1",
        };
        const first = reconcileObservedSubscriptionState(options);
        const second = reconcileObservedSubscriptionState(options);

        expect(first).toBe(second);
        await Promise.resolve();
        resolveFetch(new Response(JSON.stringify({
            ok: true,
            status: "inactive",
            subscription: {
                has_active_subscription: false,
                plan_key: "free",
            },
        }), { status: 200 }));
        await expect(first).resolves.toMatchObject({ status: "inactive" });
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("serializes opposite observations for the same user", async () => {
        const responses: ((response: Response) => void)[] = [];
        const fetchMock = jest.fn(() => new Promise<Response>((resolve) => {
            responses.push(resolve);
        })) as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;

        const active = reconcileObservedSubscriptionState({
            userId: "user_1",
            observedActive: true,
            accessToken: "token_1",
        });
        const inactive = reconcileObservedSubscriptionState({
            userId: "user_1",
            observedActive: false,
            accessToken: "token_1",
        });

        await Promise.resolve();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        responses[0](new Response(JSON.stringify({
            ok: true,
            status: "active",
            subscription: {
                has_active_subscription: true,
                plan_key: "polyglot",
            },
        }), { status: 200 }));
        await expect(active).resolves.toMatchObject({ status: "active" });
        await Promise.resolve();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        responses[1](new Response(JSON.stringify({
            ok: true,
            status: "inactive",
            subscription: {
                has_active_subscription: false,
                plan_key: "free",
            },
        }), { status: 200 }));
        await expect(inactive).resolves.toMatchObject({ status: "inactive" });
    });

    it("rejects malformed success payloads", async () => {
        globalThis.fetch = jest.fn(async () => new Response(JSON.stringify({
            ok: true,
            status: "active",
        }), { status: 200 })) as typeof fetch;

        await expect(reconcileObservedSubscriptionState({
            userId: "user_1",
            observedActive: true,
            accessToken: "token_1",
        })).rejects.toThrow("Subscription reconciliation failed with status 200");
    });
});
