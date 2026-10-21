export function translatorBase(pathname: string): "/app" | "/pwa" {
    return /^\/pwa(?:\/|$)/.test(pathname) ? "/pwa" : "/app";
}

export function isTranslatorPath(pathname: string) {
    return /^\/(?:app|pwa)(?:\/|$)/.test(pathname);
}
