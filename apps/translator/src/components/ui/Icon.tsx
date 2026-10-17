export type IconName =
    | "sidebar"
    | "settings"
    | "arrow-right"
    | "arrow-left"
    | "repeat"
    | "square"
    | "check"
    | "trash"
    | "log-out"
    | "log-in"
    | "google-g"
    | "apple-logo"
    | "chevron-right"
    | "earth";

export default function Icon(props: { name: IconName; size?: number }) {
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
