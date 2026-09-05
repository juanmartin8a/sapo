import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { authClient } from "@/lib/auth-client";
import { signOutCurrentSession } from "@/lib/auth-session";

jest.mock("@/lib/auth-client", () => ({
    authClient: { signOut: jest.fn() },
}));

const mockSignOut = jest.mocked(authClient.signOut);

describe("signOutCurrentSession", () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it("rejects an HTTP error returned without throwing", async () => {
        mockSignOut.mockResolvedValue({
            data: null,
            error: { message: "Unavailable", status: 503, statusText: "Service Unavailable" },
        });

        await expect(signOutCurrentSession()).rejects.toThrow("Unable to sign out");
    });

    it("accepts a confirmed sign-out", async () => {
        mockSignOut.mockResolvedValue({ data: { success: true }, error: null });

        await expect(signOutCurrentSession()).resolves.toBeUndefined();
    });

    it("propagates transport failures", async () => {
        mockSignOut.mockRejectedValue(new Error("Offline"));

        await expect(signOutCurrentSession()).rejects.toThrow("Offline");
    });
});
