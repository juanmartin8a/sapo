import { Link, useLocation } from "@tanstack/solid-router";

export default function SiteFooter(props: { reloadDocument?: boolean }) {
    const location = useLocation();
    return (
        <footer class="site-footer">
            <span>© 2026 Happ Technologies Inc.</span>
            <nav aria-label="Footer navigation">
                <Link
                    reloadDocument={props.reloadDocument}
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
                    reloadDocument={props.reloadDocument}
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
    );
}
