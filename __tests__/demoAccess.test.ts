import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';
import { demoAccess, matchesDemoCode } from '../betterAuth/model/demoAccess';
import { DEMO_ACCESS_EMAIL } from '../constants/demoAccess';
import { setSessionCookie } from 'better-auth/cookies';

jest.mock('better-auth/api', () => ({
    createAuthEndpoint: (_path: unknown, options: unknown, handler: unknown) => ({ options, handler }),
}));
jest.mock('better-auth/cookies', () => ({ setSessionCookie: jest.fn() }));

const originalCode = process.env.DEMO_ACCESS_CODE;
const originalUserId = process.env.DEMO_ACCESS_USER_ID;

function makeContext(code = '012345') {
    return {
        body: { code },
        context: {
            internalAdapter: {
                findUserByEmail: jest.fn<() => Promise<unknown>>().mockResolvedValue({ user: { id: 'demo-user' } }),
                createSession: jest.fn<() => Promise<unknown>>().mockResolvedValue({ token: 'session-token' }),
            },
        },
        error: (status: string) => new Error(status),
        json: (value: unknown) => value,
    };
}

const endpoint = demoAccess().endpoints.signInDemo as unknown as {
    options: { body: { safeParse: (value: unknown) => { success: boolean } } };
    handler: (ctx: ReturnType<typeof makeContext>) => Promise<unknown>;
};

describe('reviewer demo authentication', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.DEMO_ACCESS_CODE = '012345';
        process.env.DEMO_ACCESS_USER_ID = 'demo-user';
    });
    afterEach(() => {
        if (originalCode === undefined) delete process.env.DEMO_ACCESS_CODE;
        else process.env.DEMO_ACCESS_CODE = originalCode;
        if (originalUserId === undefined) delete process.env.DEMO_ACCESS_USER_ID;
        else process.env.DEMO_ACCESS_USER_ID = originalUserId;
    });

    it.each(['12345', '1234567', 'abcdef', '１２３４５６', '12345 ', 123456, null])('rejects malformed input %p', (code) => {
        expect(endpoint.options.body.safeParse({ code }).success).toBe(false);
    });

    it('preserves leading zeros and fails closed on invalid configuration', () => {
        expect(matchesDemoCode('012345', '012345')).toBe(true);
        expect(matchesDemoCode('012345', undefined)).toBe(false);
        expect(matchesDemoCode('012345', '12345')).toBe(false);
        expect(matchesDemoCode('012345', '012346')).toBe(false);
    });

    it.each(['wrong code', 'missing code', 'missing user ID'])('does not look up users or create sessions for %s', async (scenario) => {
        const ctx = makeContext(scenario === 'wrong code' ? '654321' : '012345');
        if (scenario === 'missing code') delete process.env.DEMO_ACCESS_CODE;
        if (scenario === 'missing user ID') delete process.env.DEMO_ACCESS_USER_ID;
        await expect(endpoint.handler(ctx)).rejects.toThrow('UNAUTHORIZED');
        expect(ctx.context.internalAdapter.findUserByEmail).not.toHaveBeenCalled();
        expect(ctx.context.internalAdapter.createSession).not.toHaveBeenCalled();
        expect(setSessionCookie).not.toHaveBeenCalled();
    });

    it('fails closed when the designated account was deleted', async () => {
        const ctx = makeContext();
        ctx.context.internalAdapter.findUserByEmail.mockResolvedValue(null);
        await expect(endpoint.handler(ctx)).rejects.toThrow('UNAUTHORIZED');
        expect(ctx.context.internalAdapter.createSession).not.toHaveBeenCalled();
    });

    it('creates a normal session only for the designated user and allows code reuse', async () => {
        const ctx = makeContext();
        await expect(endpoint.handler(ctx)).resolves.toEqual({ success: true });
        await expect(endpoint.handler(ctx)).resolves.toEqual({ success: true });
        expect(ctx.context.internalAdapter.findUserByEmail).toHaveBeenCalledWith(DEMO_ACCESS_EMAIL);
        expect(ctx.context.internalAdapter.createSession).toHaveBeenCalledWith('demo-user');
        expect(setSessionCookie).toHaveBeenCalledTimes(2);
    });

    it.each(['12', 'another-user', ' demo-user '])('rejects an incorrect configured ID %p without an ID lookup', async (userId) => {
        process.env.DEMO_ACCESS_USER_ID = userId;
        const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const ctx = makeContext();
            await expect(endpoint.handler(ctx)).rejects.toThrow('SERVICE_UNAVAILABLE');
            expect(ctx.context.internalAdapter.createSession).not.toHaveBeenCalled();
            expect(setSessionCookie).not.toHaveBeenCalled();
            expect(warning).toHaveBeenCalledWith(expect.stringContaining('auth:provisionDemoUser'));
        } finally {
            warning.mockRestore();
        }
    });

    it('does not issue a cookie when session creation fails', async () => {
        const ctx = makeContext();
        ctx.context.internalAdapter.createSession.mockResolvedValue(null);
        await expect(endpoint.handler(ctx)).rejects.toThrow('INTERNAL_SERVER_ERROR');
        expect(setSessionCookie).not.toHaveBeenCalled();
    });
});
