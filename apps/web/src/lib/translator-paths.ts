export function translatorBase(pathname: string): "" | "/pwa" {
    return /^\/pwa(?:\/|$)/.test(pathname) ? "/pwa" : "";
}

export function isTranslatorPath(pathname: string) {
    return (
        pathname === "/" ||
        /^\/(?:auth|auth-callback|settings)\/?$/.test(pathname) ||
        /^\/account\/delete-account\/?$/.test(pathname) ||
        /^\/(?:app|pwa)(?:\/|$)/.test(pathname)
    );
}

export function deleteAccountPath(basePath: "" | "/pwa") {
    return basePath === "/pwa" ? "/pwa/delete-account" : "/account/delete-account";
}
