import { For } from "solid-js";
import type { JSX } from "@solidjs/web";
import { createFrogAnimation } from "@/lib/createFrogAnimation";
import Frog from "./Frog";
export default function PageHeading(props: { title: string; children?: JSX.Element }) {
    const words = () => props.title.split(" ");
    const animation = createFrogAnimation(() => words().map(() => 240));
    return (
        <div class="page-heading with-frog">
            <Frog animation={animation} />
            <div class="heading-content">
                <h1 class="page-title" aria-label={props.title}>
                    <For each={words()}>
                        {(word, index) => (
                            <span
                                aria-hidden="true"
                                class={animation.revealed() < index() ? "unspoken" : ""}
                            >
                                {word + (index() < words().length - 1 ? " " : "")}
                            </span>
                        )}
                    </For>
                </h1>
                {props.children}
            </div>
        </div>
    );
}
