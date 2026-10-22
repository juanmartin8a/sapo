import type { iconAssetNames } from "@/constants/icons";

type IconName = (typeof iconAssetNames)[number] | "arrow-right-left" | "copy" | "chevron-down";

export default function Icon(props: { name: IconName; size?: number }) {
    if (
        props.name === "chevron-down" ||
        props.name === "arrow-right-left" ||
        props.name === "copy"
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
                {props.name === "chevron-down" ? (
                    <path d="m6 9 6 6 6-6" />
                ) : props.name === "copy" ? (
                    <>
                        <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                    </>
                ) : (
                    <>
                        <path d="m16 3 4 4-4 4" />
                        <path d="M20 7H4" />
                        <path d="m8 21-4-4 4-4" />
                        <path d="M4 17h16" />
                    </>
                )}
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
