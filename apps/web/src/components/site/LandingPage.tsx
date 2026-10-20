import { Link } from "@tanstack/solid-router";
import { For } from "solid-js";
import Frog from "./Frog";
import { createFrogAnimation } from "@/lib/createFrogAnimation";
const lines = [
    [
        { text: "Sound", index: 0 },
        { text: "Adaptation", index: 1 },
    ],
    [
        { text: "&", index: 2 },
        { text: "Phonetic", index: 3 },
        { text: "Orchestration", index: 4 },
    ],
];
export default function LandingPage() {
    const animation = createFrogAnimation(() => [220, 420, 180, 320, 440]);
    return (
        <div class="landing-page">
            <section class="hero" aria-labelledby="project-name">
                <div class="hero-copy">
                    <div class="project-identity">
                        <Frog animation={animation} />
                        <h1
                            id="project-name"
                            class="project-name"
                            aria-label="Sound Adaptation and Phonetic Orchestration"
                        >
                            <For each={lines}>
                                {(line) => (
                                    <span class="name-line" aria-hidden="true">
                                        <For each={line}>
                                            {(word) => (
                                                <span
                                                    class={`name-word ${animation.revealed() < word.index ? "unspoken" : ""}`}
                                                >
                                                    {word.text}
                                                </span>
                                            )}
                                        </For>
                                    </span>
                                )}
                            </For>
                        </h1>
                    </div>
                    <p class="mission">
                        {
                            " SAPO aims to bridge language gaps by making pronunciation across languages easier and more intuitive through phonetic representation. These representations can include "
                        }
                        <a
                            href="https://en.wikipedia.org/wiki/Phonetic_transcription"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {"phonetic transcription"}
                        </a>
                        {", but SAPO focuses primarily on cross-lingual "}
                        <a
                            href="https://en.wikipedia.org/wiki/Pronunciation_respelling"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {"pronunciation respelling"}
                        </a>
                        {
                            "—writing words as they sound using the spelling patterns of another language. "
                        }
                    </p>
                </div>
            </section>
            <section class="destinations" aria-label="Available resources">
                <article class="destination">
                    <h2>{"Multilingual phonetic representations"}</h2>
                    <p>
                        {
                            " A database containing phonetic transcriptions and pronunciation respellings across languages, available for language learning and linguistic research. "
                        }
                    </p>
                    <Link class="resource-link" to="/multilingual-phonetic-representations/">
                        {" Browse the database "}
                        <span aria-hidden="true">{"↗"}</span>
                    </Link>
                </article>
                <article class="destination app-destination">
                    <h2>{"Tools"}</h2>
                    <p>
                        {
                            " Translate and respell in your browser or with the iOS app. The mobile app also offers optional local models for offline use. "
                        }
                        <br />
                        <br />
                        {" An Android version and more tools are coming soon. "}
                    </p>
                    <div class="app-links">
                        <Link class="resource-link" to="/app/">
                            {"Try the web app "}
                            <span aria-hidden="true">{"↗"}</span>
                        </Link>
                        <a
                            class="resource-link"
                            href="https://apps.apple.com/us/app/s-a-p-o-transl-ate-iterate/id6752793342"
                            target="_blank"
                            rel="noreferrer"
                        >
                            {" View on the App Store "}
                            <span aria-hidden="true">{"↗"}</span>
                        </a>
                    </div>
                </article>
            </section>
        </div>
    );
}
