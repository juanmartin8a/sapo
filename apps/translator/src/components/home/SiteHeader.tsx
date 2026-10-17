// Keep the desktop site navigation aligned with apps/web/src/lib/SiteShell.svelte.
export default function SiteHeader() {
    return (
        <header class="site-header desktop-only">
            <a class="site-wordmark" href="/" aria-label="SAPO home">
                S A P O
            </a>
            <nav aria-label="Main navigation">
                <a href="/app/" aria-current="page">
                    Open app
                </a>
                <a href="/multilingual-phonetic-representations/">Database</a>
                <a href="/support/">Support</a>
            </nav>
        </header>
    );
}
