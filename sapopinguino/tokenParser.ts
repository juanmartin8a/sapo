export type Token =
    | {
          type: string;
          input: string;
          transcription: string;
          output: string;
      }
    | {
          type: string;
          value: string;
      };

export class TokenParser {
    private hasEnteredTokensArray = false;
    private collectingToken = false;
    private currentToken = "";
    private bracketDepth = 0;
    private inString = false;
    private isEscaping = false;

    consume(delta: string): Token[] {
        const parsedTokens: Token[] = [];

        for (const character of delta) {
            if (!this.hasEnteredTokensArray) {
                if (character === "[") {
                    this.hasEnteredTokensArray = true;
                }
                continue;
            }

            if (!this.collectingToken) {
                if (character === "[") {
                    this.collectingToken = true;
                    this.currentToken = "[";
                    this.bracketDepth = 1;
                    this.inString = false;
                    this.isEscaping = false;
                }
                continue;
            }

            this.currentToken += character;

            if (this.inString) {
                if (this.isEscaping) {
                    this.isEscaping = false;
                    continue;
                }

                if (character === "\\") {
                    this.isEscaping = true;
                    continue;
                }

                if (character === '"') {
                    this.inString = false;
                }
                continue;
            }

            if (character === '"') {
                this.inString = true;
                continue;
            }

            if (character === "[") {
                this.bracketDepth += 1;
                continue;
            }

            if (character === "]") {
                this.bracketDepth -= 1;
                if (this.bracketDepth === 0) {
                    const token = this.parseToken(this.currentToken);
                    if (token !== null) {
                        parsedTokens.push(token);
                    }

                    this.collectingToken = false;
                    this.currentToken = "";
                }
            }
        }

        return parsedTokens;
    }

    private parseToken(tokenText: string): Token | null {
        let tokenSlice: unknown;
        try {
            tokenSlice = JSON.parse(tokenText);
        } catch {
            return null;
        }

        if (!Array.isArray(tokenSlice) || tokenSlice.length < 2) {
            return null;
        }

        const tokenType = typeof tokenSlice[0] === "string" ? tokenSlice[0] : null;
        if (tokenType === null) {
            return null;
        }

        if (tokenType === "word" && tokenSlice.length >= 4) {
            const input = typeof tokenSlice[1] === "string" ? tokenSlice[1] : "";
            const transcription = typeof tokenSlice[2] === "string" ? tokenSlice[2] : "";
            const output = typeof tokenSlice[3] === "string" ? tokenSlice[3] : "";

            return {
                type: tokenType,
                input,
                transcription,
                output,
            };
        }

        const value = typeof tokenSlice[1] === "string" ? tokenSlice[1] : "";
        return {
            type: tokenType,
            value,
        };
    }
}
