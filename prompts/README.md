# Cloudflare AI setup

Respelling calls `gpt-6-luna` through Cloudflare AI Gateway's provider-native Responses endpoint with `reasoning.effort: "none"`. Translation calls `@cf/google/gemma-4-26b-a4b-it` through the Workers AI chat-completions REST endpoint with `chat_template_kwargs.enable_thinking: false`. Cloudflare names the 26B model **A4B**, not E4B. Both calls run in Convex HTTP actions; no separate Worker deployment is needed.

## Convex environment variables

Set these in the Convex dashboard for each deployment (development and production):

| Variable | Value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID containing the gateway and Workers AI access. |
| `CLOUDFLARE_AI_GATEWAY_ID` | Gateway ID/slug, not its complete URL. Required for respelling. |
| `CLOUDFLARE_API_TOKEN` | Secret account-scoped token with **AI Gateway Run**, **Workers AI Read**, and **Workers AI Edit** permissions. |

Create a gateway and enable Authenticated Gateway. To use GPT without an OpenAI key in Convex, load Cloudflare Unified Billing credits and confirm the gateway can run `gpt-6-luna`. Alternatively, store an OpenAI key with access to that model as the default OpenAI BYOK credential in the gateway. GPT still runs on OpenAI infrastructure through Cloudflare; Gemma runs on Workers AI. Translation uses direct Workers AI billing/access, separately from the gateway's Unified Billing balance.

The backend no longer reads `OPENAI_API_KEY`, `OPENAI_SAPOPINGUINO_PROMPT_ID`, `OPENAI_SAPOPINGUINO_PROMPT_V`, `OPENAI_SAPOPINGUINO_TRANSLATE_PROMPT_ID`, or `OPENAI_SAPOPINGUINO_TRANSLATE_PROMPT_V`. Remove these obsolete Convex variables after rollout. Do not prefix Cloudflare credentials with `EXPO_PUBLIC_`.

## Editing and deploying prompts

Edit `respell.md` or `translate.md`, then run `npm run prompts:generate` from the app root. Commit the Markdown and `convex/model/sapopinguino/prompts.generated.ts` together in the Convex submodule. The generated module is required because the Convex isolate has no runtime filesystem access and the installed bundler has no Markdown loader. Never edit it manually.

Use `npm run convex:dev` or `npm run convex:deploy` from the app root to regenerate before starting Convex. After subsequent Markdown edits during a running dev session, rerun `npm run prompts:generate`. If invoking the Convex CLI directly, generate first. `npm run prompts:check` and the provider test detect stale bundles.

The integration preserves the client stream formats and existing quota lifecycle. It forwards only model output text, rejects incomplete/error terminal events, and retains cancellation, a 120-second total timeout, and a 20-second idle timeout. Translation permits up to 16,384 output tokens; a length-limited result is reported as an error rather than a successful translation. Respelling imports `respell.schema.json` directly and sends it as `text.format: { type: "json_schema", ...schemaFile }`, including `name: "sapopinguino"` and `strict: true`. Unlike Markdown, JSON imports are supported by the bundler and need no generation step. The supplied tuple schema is preserved exactly. Schema constraints do not guarantee phonetic correctness or alignment with the source text.

The Responses API places `name`, `strict`, and `schema` directly inside `text.format`; do not use the Chat Completions `response_format.json_schema` wrapper. OpenAI documents a subset of JSON Schema but does not explicitly document `prefixItems` in its current guide. Acceptance of the supplied tuple schema by this model through the gateway still requires a live smoke test. Unsupported schemas produce an upstream error; the application does not silently fall back to JSON mode.

## Prompt rationale and sources

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs): Responses `text.format`, strict schemas, supported JSON Schema subset, refusals, and streaming.

- [OpenAI GPT-6 guidance](https://developers.openai.com/api/docs/guides/latest-model): retain supported reasoning effort and evaluate prompts on the chosen model. The respelling prompt keeps the token contract and language rules while removing repeated instructions and long examples.
- [GPT-6 Luna model](https://developers.openai.com/api/docs/models/gpt-6-luna): model identifier, Structured Outputs, and support for reasoning effort `none`.
- [Rethinking skills and prompts for GPT-6 Astra](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra): review accumulated instructions for unnecessary context. Its advice is written for agent prompts, so respelling quality still needs workload-specific evaluation.
- [Cloudflare OpenAI provider](https://developers.cloudflare.com/ai-gateway/usage/providers/openai/): Responses endpoint and Cloudflare-only authentication using stored credentials or Unified Billing.
- [Authenticated Gateway](https://developers.cloudflare.com/ai-gateway/configuration/authentication/) and [Workers AI REST setup](https://developers.cloudflare.com/workers-ai/get-started/rest-api/): token setup and permissions.
- [Cloudflare Gemma model](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/) and [thinking-disabled example](https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/): exact model slug, chat completions, and `enable_thinking: false`.
- [Google Gemma 4 formatting](https://ai.google.dev/gemma/docs/core/prompt-formatting-gemma4): native system messages and thinking behavior. Send structured messages instead of manually injecting chat-template tokens. Ignore reasoning fields in streamed responses.
- [Community translation experience](https://discuss.ai.google.dev/t/gemma-4-really-good-with-ollama/140553): firsthand examples emphasize natural translation, preserved markup and names, and text-only responses. These are useful prompt design ideas, not a quality benchmark for this app.

Before production rollout, smoke-test both models with real Cloudflare credentials and representative language pairs, mixed-language text, embedded instructions, emoji, placeholders, and multiline formatting. Local mocked tests verify the transport contract, not model quality, account access, or gateway model availability.


## Translate, then respell back

The respelling endpoint accepts an optional boolean `translateThenRespell` beside
`input` and `streamId`. It defaults to false. When true, Convex buffers a complete
translation, then passes it to the existing respelling integration with the source
and respelling languages resolved as described below. Translation deltas are also
forwarded to the client as preview events.

This is one subscription-gated respelling request, measured using the original
input characters. The existing quota lifecycle charges on the first respelling
token; translation failures release the reservation without charging. Translation
output is bounded to 65,536 UTF-16 code units. Each model call retains its existing
timeouts and shares request cancellation. Empty keepalive lines preserve the
respelling stream protocol during the two stages; the app allows 255 seconds for
the combined request.

### Respell language and translation preview

Combined requests accept `respellLanguage` (`Source` by default, or a supported
language). `Source` follows the explicit source or the detected original input
language. The combined translation stage uses GPT-6 Luna through the same OpenAI
Responses gateway as respelling; ordinary translation retains Workers AI.
Only Auto-detect + Respell Source requests use strict structured translation
output (`detectedSourceLanguage`, then `translation`). The backend decodes the
translation incrementally and validates the full object after `response.completed`.
Unknown or unsupported detection stops before respelling with a recoverable
source-selection error. No model-generated terminator is used.

The line protocol adds JSON events `translation_preview` (string `value`),
`respell_start`, and `source_undetermined`. Preview text is not a respelling token
and does not trigger mouth animation or quota charging. Existing quota charging
still occurs on the first respelling token. The final end/error markers remain
unchanged. Interrupted or invalid translations never start respelling.
