import { Link, Outlet, useLocation } from "@tanstack/solid-router";
import SiteHeader from "./SiteHeader";
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
                    class={`site-main ${location().pathname === "/" ? "home" : ""}`}
                >
                    <Outlet />
                </main>
                <footer class="site-footer">
                    <span>© 2026 Happ Technologies Inc.</span>
                    <nav aria-label="Footer navigation">
                        <Link
                            to="/terms-of-use/"
                            aria-current={
                                location().pathname.replace(/\/$/, "") === "/terms-of-use"
                                    ? "page"
                                    : undefined
                            }
                        >
                            Terms
                        </Link>
                        <Link
                            to="/privacy-policy/"
                            aria-current={
                                location().pathname.replace(/\/$/, "") === "/privacy-policy"
                                    ? "page"
                                    : undefined
                            }
                        >
                            Privacy
                        </Link>
                    </nav>
                </footer>
            </div>
        </div>
    );
}
