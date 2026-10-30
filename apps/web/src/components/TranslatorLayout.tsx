import { Outlet, useLocation } from "@tanstack/solid-router";
import { Show } from "solid-js";
import SiteHeader from "@/components/site/SiteHeader";
import AppProvider from "@/providers/AppProvider";
import SiteFooter from "@/components/site/SiteFooter";
import { isThemePreviewPath } from "@/lib/site-theme";
// Let Vite await the stylesheet with this lazy route chunk before rendering it.
import "@/styles/translator.css";

export default function TranslatorLayout(props: { pwa?: boolean }) {
    const location = useLocation();
    return (
        <div
            class={`translator ${props.pwa ? "translator-pwa" : "translator-web"} ${!props.pwa && isThemePreviewPath(location().pathname) ? "theme-preview" : ""}`}
        >
            <AppProvider pwa={props.pwa}>
                <Show when={!props.pwa}>
                    <SiteHeader />
                </Show>
                <Outlet />
            </AppProvider>
            <Show when={!props.pwa}>
                <SiteFooter />
            </Show>
        </div>
    );
}
