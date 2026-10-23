import { Outlet, useLocation } from "@tanstack/solid-router";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
export default function SiteLayout() {
    const location = useLocation();
    return (
        <div class="marketing-site">
            <div class="site-shell">
                <a class="skip-link" href="#main-content">
                    Skip to content
                </a>
                <SiteHeader />
                <main
                    id="main-content"
                    class={`site-main ${location().pathname.replace(/\/$/, "") === "/about" ? "home" : ""}`}
                >
                    <Outlet />
                </main>
                <SiteFooter />
            </div>
        </div>
    );
}
