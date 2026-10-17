interface CrossDomainAuthClient {
    crossDomain: {
        oneTimeToken: {
            verify: (args: { token: string }) => Promise<{
                data?: { session?: { token: string } } | null;
                error?: unknown;
            }>;
        };
    };
    getSession: (args: {
        fetchOptions: { headers: { Authorization: string } };
    }) => Promise<{ error?: unknown }>;
    updateSession: () => void;
}

// Match ConvexBetterAuthProvider's web callback exchange without a React dependency.
export async function exchangeSignInCallback(
    href: string,
    client: CrossDomainAuthClient,
    replaceUrl: (url: string) => void,
) {
    const url = new URL(href);
    const token = url.searchParams.get("ott");
    if (!token) return;
    url.searchParams.delete("ott");
    replaceUrl(`${url.pathname}${url.search}${url.hash}`);
    const result = await client.crossDomain.oneTimeToken.verify({ token });
    if (result.error || !result.data?.session) {
        throw new Error("Sign-in could not be completed. Please try again.");
    }
    const session = await client.getSession({
        fetchOptions: {
            headers: { Authorization: `Bearer ${result.data.session.token}` },
        },
    });
    if (session.error)
        throw new Error("Sign-in could not be completed. Please try again.");
    client.updateSession();
}
