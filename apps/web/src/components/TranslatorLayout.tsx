import { Outlet } from "@tanstack/solid-router";
import { Show } from "solid-js";
import SiteHeader from "@/components/site/SiteHeader";
import AppProvider from "@/providers/AppProvider";
import SiteFooter from "@/components/site/SiteFooter";

export default function TranslatorLayout(props: { pwa?: boolean }) {
    return (
        <div class={`translator ${props.pwa ? "translator-pwa" : "translator-web"}`}>
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
