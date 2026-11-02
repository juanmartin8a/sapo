import type { FrogAnimation } from "@/lib/createFrogAnimation";
import FrogImage from "@/components/ui/FrogImage";
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
                <FrogImage
                    class="closed"
                    pose="closed"
                    src="/sapo-frog.svg"
                    width={929}
                    height={800}
                />
                <FrogImage
                    class="open"
                    pose="open"
                    src="/sapo-frog-open.svg"
                    width={929}
                    height={914}
                />
            </span>
        </button>
    );
}
