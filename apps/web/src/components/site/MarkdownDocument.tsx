import type { JSX } from "@solidjs/web";
import { markdownToHtml } from "@/lib/markdown";
export default function MarkdownDocument(props: { markdown: string; children?: JSX.Element }) {
    return (
        <>
            <article class="legal-document" innerHTML={markdownToHtml(props.markdown)} />
            {props.children}
        </>
    );
}
