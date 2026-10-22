import { Link, useLocation } from "@tanstack/solid-router";
import { createEffect, createSignal, createUniqueId, onSettled } from "solid-js";
import AccountControl from "@/components/auth/AccountControl";

export default function SiteHeader() {
    const location = useLocation();
    const pathname = () => location().pathname.replace(/\/$/, "") || "/";
    const inApp = () => pathname() === "/app" || pathname().startsWith("/app/");
    const menuId = createUniqueId();
    const [menuOpen, setMenuOpen] = createSignal(false);
    let menu: HTMLDivElement | undefined;
    let trigger: HTMLButtonElement | undefined;
    const closeMenu = () => menu?.hidePopover();

    createEffect(() => location().pathname, closeMenu);
    onSettled(() => {
        const popup = menu!;
        const button = trigger!;
        const narrow = window.matchMedia("(max-width: 640px)");
        const position = () => {
            if (!narrow.matches) {
                closeMenu();
                return;
            }
            const anchor = button.getBoundingClientRect();
            const width = Math.min(240, window.innerWidth - 32);
            const top = anchor.bottom + 8;
            popup.style.left = `${Math.max(16, Math.min(anchor.left, window.innerWidth - width - 16))}px`;
            popup.style.top = `${top}px`;
            popup.style.maxHeight = `${Math.max(0, window.innerHeight - top - 16)}px`;
        };
        const beforeToggle = (event: ToggleEvent) => {
            if (event.newState === "open") position();
        };
        const toggle = (event: ToggleEvent) => setMenuOpen(event.newState === "open");
        popup.addEventListener("beforetoggle", beforeToggle);
        popup.addEventListener("toggle", toggle);
        window.addEventListener("resize", position);
        window.addEventListener("scroll", position, true);
        return () => {
            popup.removeEventListener("beforetoggle", beforeToggle);
            popup.removeEventListener("toggle", toggle);
            window.removeEventListener("resize", position);
            window.removeEventListener("scroll", position, true);
        };
    });

    const NavigationLinks = () => (
        <>
            <Link to="/app/" aria-current={inApp() ? "page" : undefined} onClick={closeMenu}>
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
                onClick={closeMenu}
            >
                Database
            </Link>
            <Link
                to="/support/"
                aria-current={["/support", "/contact-us"].includes(pathname()) ? "page" : undefined}
                onClick={closeMenu}
            >
                Support
            </Link>
        </>
    );

    return (
        <header class="site-header">
            <button
                ref={(element) => {
                    trigger = element;
                }}
                class="site-menu-toggle"
                type="button"
                popovertarget={menuId}
                aria-label="Navigation menu"
                aria-controls={menuId}
                aria-expanded={menuOpen() ? "true" : "false"}
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                >
                    <path d="M4 5h16" />
                    <path d="M4 12h16" />
                    <path d="M4 19h16" />
                </svg>
            </button>
            <Link class="site-wordmark" to="/" aria-label="SAPO home" onClick={closeMenu}>
                S A P O
            </Link>
            <nav class="site-main-navigation" aria-label="Main navigation">
                <NavigationLinks />
            </nav>
            <AccountControl class="site-account" showSubscription={false} onNavigate={closeMenu} />
            <div
                ref={(element) => {
                    menu = element;
                }}
                id={menuId}
                class="site-menu-popover"
                popover="auto"
            >
                <nav class="site-menu-navigation" aria-label="Main navigation">
                    <NavigationLinks />
                </nav>
            </div>
        </header>
    );
}
