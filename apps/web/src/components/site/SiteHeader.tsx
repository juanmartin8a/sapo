import { Link, useLocation } from "@tanstack/solid-router";
import AccountControl from "@/components/auth/AccountControl";
export default function SiteHeader(props: { desktopOnly?: boolean }) {
    const location = useLocation();
    const pathname = () => location().pathname.replace(/\/$/, "") || "/";
    const inApp = () => pathname() === "/app" || pathname().startsWith("/app/");
    return (
        <header class={`site-header ${props.desktopOnly ? "desktop-only" : ""}`}>
            <Link class="site-wordmark" to="/" aria-label="SAPO home">
                S A P O
            </Link>
            <nav aria-label="Main navigation">
                <Link to="/app/" aria-current={inApp() ? "page" : undefined}>
                    Web app
                </Link>
                <Link
                    to="/multilingual-phonetic-representations/"
                    aria-current={
                        pathname() === "/multilingual-phonetic-representations"
                            ? "page"
                            : pathname().startsWith("/multilingual-phonetic-representations/")
                              ? "location"
                              : undefined
                    }
                >
                    Database
                </Link>
                <Link
                    to="/support/"
                    aria-current={
                        ["/support", "/contact-us"].includes(pathname()) ? "page" : undefined
                    }
                >
                    Support
                </Link>
                <AccountControl class="site-account" showSubscription={false} />
            </nav>
        </header>
    );
}
