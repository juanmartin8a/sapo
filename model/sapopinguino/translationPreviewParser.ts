/** Incrementally decodes the translation value of a flat JSON object.
 * Full JSON/schema validation remains mandatory after upstream completion.
 */
export class TranslationPreviewParser {
    private state: "start" | "key" | "colon" | "value" | "comma" | "done" = "start";
    private inString = false;
    private escaped = false;
    private unicode: string | null = null;
    private key = "";
    private value = "";
    private pending = "";

    consume(chunk: string): string {
        for (const char of chunk) {
            if (this.inString) {
                if (this.unicode !== null) {
                    if (!/^[0-9a-f]$/i.test(char)) throw new Error("Invalid Unicode escape");
                    this.unicode += char;
                    if (this.unicode.length === 4) {
                        this.append(String.fromCharCode(parseInt(this.unicode, 16)));
                        this.unicode = null;
                    }
                } else if (this.escaped) {
                    this.escaped = false;
                    if (char === "u") this.unicode = "";
                    else this.append(JSON.parse(`"\\${char}"`) as string);
                } else if (char === "\\") {
                    this.escaped = true;
                } else if (char === '"') {
                    this.inString = false;
                    if (this.state === "key") {
                        this.key = this.value;
                        this.state = "colon";
                    } else this.state = "comma";
                    this.value = "";
                } else {
                    if (char.charCodeAt(0) < 32) throw new Error("Invalid JSON string");
                    this.append(char);
                }
                continue;
            }
            if (/\s/.test(char)) continue;
            if (this.state === "start" && char === "{") this.state = "key";
            else if ((this.state === "key" || this.state === "value") && char === '"') this.inString = true;
            else if (this.state === "colon" && char === ":") this.state = "value";
            else if (this.state === "comma" && char === ",") this.state = "key";
            else if (this.state === "comma" && char === "}") this.state = "done";
            else throw new Error("Invalid translation JSON");
        }
        // Keep a split surrogate pair together when forwarding UTF-8 to the client.
        const hold = /[\uD800-\uDBFF]$/.test(this.pending) ? 1 : 0;
        const output = this.pending.slice(0, this.pending.length - hold);
        this.pending = hold ? this.pending.slice(-1) : "";
        return output;
    }

    private append(text: string) {
        this.value += text;
        if (this.state === "value" && this.key === "translation") this.pending += text;
    }
}
