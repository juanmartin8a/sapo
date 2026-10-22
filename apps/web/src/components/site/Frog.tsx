import type { FrogAnimation } from "@/lib/createFrogAnimation";
export default function Frog(props: { animation: FrogAnimation }) {
    return (
        <button
            type="button"
            class={`sapo-frog-transition frog ${props.animation.speaking() ? "speaking" : ""}`}
            disabled={props.animation.disabled()}
            onClick={props.animation.openMouth}
            aria-label="Make the SAPO frog open its mouth"
        >
            <span class="frog-art">
                <img class="closed" src="/sapo-frog.svg" alt="" width="929" height="800" />
                <img class="open" src="/sapo-frog-open.svg" alt="" width="929" height="914" />
            </span>
        </button>
    );
}
