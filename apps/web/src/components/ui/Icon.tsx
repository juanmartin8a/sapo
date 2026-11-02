import { Match, Switch } from "solid-js";
import type { iconAssetNames } from "@/constants/icons";

type IconName =
    | (typeof iconAssetNames)[number]
    | "arrow-right-left"
    | "copy"
    | "chevron-down"
    | "x"
    | "sun"
    | "moon"
    | "sun-moon";

export default function Icon(props: { name: IconName; size?: number }) {
    if (
        props.name === "chevron-down" ||
        props.name === "arrow-right-left" ||
        props.name === "copy" ||
        props.name === "check" ||
        props.name === "x" ||
        props.name === "sun" ||
        props.name === "moon" ||
        props.name === "sun-moon"
    ) {
        return (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                class={`icon ${props.name}`}
                width={props.size ?? 20}
                height={props.size ?? 20}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
            >
                <Switch>
                    <Match when={props.name === "check"}>
                        <polyline points="20 6 9 17 4 12" />
                    </Match>
                    <Match when={props.name === "chevron-down"}>
                        <path d="m6 9 6 6 6-6" />
                    </Match>
                    <Match when={props.name === "copy"}>
                        <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                    </Match>
                    <Match when={props.name === "arrow-right-left"}>
                        <path d="m16 3 4 4-4 4" />
                        <path d="M20 7H4" />
                        <path d="m8 21-4-4 4-4" />
                        <path d="M4 17h16" />
                    </Match>
                    <Match when={props.name === "x"}>
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                    </Match>
                    <Match when={props.name === "sun"}>
                        <circle cx="12" cy="12" r="4" />
                        <path d="M12 2v2" />
                        <path d="M12 20v2" />
                        <path d="m4.93 4.93 1.41 1.41" />
                        <path d="m17.66 17.66 1.41 1.41" />
                        <path d="M2 12h2" />
                        <path d="M20 12h2" />
                        <path d="m6.34 17.66-1.41 1.41" />
                        <path d="m19.07 4.93-1.41 1.41" />
                    </Match>
                    <Match when={props.name === "moon"}>
                        <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
                    </Match>
                    <Match when={props.name === "sun-moon"}>
                        <path d="M12 2v2" />
                        <path d="M14.837 16.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715" />
                        <path d="M16 12a4 4 0 0 0-4-4" />
                        <path d="m19 5-1.256 1.256" />
                        <path d="M20 12h2" />
                    </Match>
                </Switch>
            </svg>
        );
    }
    return (
        <img
            class="icon"
            src={`/app/icons/${props.name}.svg`}
            alt=""
            aria-hidden="true"
            width={props.size ?? 20}
            height={props.size ?? 20}
        />
    );
}
