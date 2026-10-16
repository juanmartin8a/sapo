import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { authComponent } from '../betterAuth/auth';
import { hasSignInProviderAccount } from '../betterAuth/model/providerAccount';
import { resolveCurrentUser } from '../model/auth';
import type { QueryCtx } from '../_generated/server';

jest.mock('../betterAuth/auth', () => ({ authComponent: { safeGetAuthUser: jest.fn() } }));
jest.mock('../betterAuth/model/providerAccount', () => ({ hasSignInProviderAccount: jest.fn() }));

const originalUserId = process.env.DEMO_ACCESS_USER_ID;
const currentUser = jest.mocked(authComponent.safeGetAuthUser);
const hasProvider = jest.mocked(hasSignInProviderAccount);
const ctx = {} as QueryCtx;

describe('demo backend authorization', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.DEMO_ACCESS_USER_ID = 'demo-user';
        hasProvider.mockResolvedValue(false);
    });
    afterEach(() => {
        if (originalUserId === undefined) delete process.env.DEMO_ACCESS_USER_ID;
        else process.env.DEMO_ACCESS_USER_ID = originalUserId;
    });

    function signedInAs(id: string) {
        currentUser.mockResolvedValue({ _id: id } as NonNullable<Awaited<ReturnType<typeof authComponent.safeGetAuthUser>>>);
    }

    it('authorizes the designated demo user without a social account', async () => {
        signedInAs('demo-user');
        expect((await resolveCurrentUser(ctx))?.userId).toBe('demo-user');
        expect(hasProvider).not.toHaveBeenCalled();
    });

    it('still rejects other users without a social account', async () => {
        signedInAs('other-user');
        expect(await resolveCurrentUser(ctx)).toBeNull();
        expect(hasProvider).toHaveBeenCalledWith(ctx, 'other-user');
    });

    it('continues authorizing existing social accounts', async () => {
        signedInAs('social-user');
        hasProvider.mockResolvedValue(true);
        expect((await resolveCurrentUser(ctx))?.userId).toBe('social-user');
    });

    it('revokes the demo exception when configuration is removed', async () => {
        signedInAs('demo-user');
        delete process.env.DEMO_ACCESS_USER_ID;
        expect(await resolveCurrentUser(ctx)).toBeNull();
    });

    it('never authorizes a missing session', async () => {
        currentUser.mockResolvedValue(undefined);
        expect(await resolveCurrentUser(ctx)).toBeNull();
    });
});
