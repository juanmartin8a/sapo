import { redirect, type ParsedLocation } from "@tanstack/solid-router";

export function legacyTranslatorRedirect(
    destination: "/" | "/auth/" | "/settings/" | "/auth-callback/" | "/account/delete-account/",
) {
    return ({ location }: { location: ParsedLocation }) => {
        throw redirect({
            to: destination,
            href: `${destination}${location.searchStr}${location.hash ? `#${location.hash}` : ""}`,
            statusCode: 308,
        });
    };
}
