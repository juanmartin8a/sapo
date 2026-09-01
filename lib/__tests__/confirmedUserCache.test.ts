import { describe, expect, it } from "@jest/globals";

import { parseConfirmedUserSnapshot } from "@/lib/confirmed-user-cache";

describe("confirmed user cache", () => {
    it("accepts a valid confirmed user", () => {
        expect(parseConfirmedUserSnapshot({
            version: 1,
            userId: "user-a",
            email: "user@example.com",
        })).toEqual({
            version: 1,
            userId: "user-a",
            email: "user@example.com",
        });
    });

    it("rejects incomplete user data", () => {
        expect(parseConfirmedUserSnapshot(null)).toBeNull();
        expect(parseConfirmedUserSnapshot({
            version: 1,
            userId: "user-a",
            email: "",
        })).toBeNull();
    });
});
