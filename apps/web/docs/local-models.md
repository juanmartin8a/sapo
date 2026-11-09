# Local translation

The website and `/pwa/` use the same settings, store, and translation controls.
Choose **Settings → Local AI** to configure a server or import a GGUF. Choose
**Local** on the translator to activate it. No SAPO account or subscription is
required. Respelling requires an active Polyglot subscription and always uses
Online, with Local disabled and an explanation
in the provider selector. Returning to Translate restores the chosen provider and
model without unloading a loaded browser model.

On the website, open the Online/Local dropdown beside Translate and Respell to
switch providers, select a model, and refresh or load it. These controls appear
in a compact panel with separate rows. The PWA keeps them in its sidebar.

Local model configuration has its own page at `/settings/local-ai/` on the
website and `/pwa/settings/local-ai/` in the PWA. Both Settings → Local AI
and the translator’s Manage Local AI (website) or Manage models (PWA) link open it.
Returning to Settings or the translator keeps session-only API keys and imported
models available.

## Local servers

The browser calls the configured server directly. There is no backend proxy.
Presets cover Ollama, LM Studio, llama.app, and llama.cpp; Custom accepts another
HTTP(S) API base URL. The base URL includes `/v1` (or the equivalent API prefix).

- Model discovery uses `GET /models`. Only the server's advertised models appear;
  a manual model ID is available for servers that do not enumerate every model.
- Translation uses stateless, streaming `POST /responses` with `store: false`.
  The server must support the Responses API. There is no Chat Completions or
  cloud fallback. Reasoning events are excluded from translation output.
- Start the server, allow the SAPO website's exact origin in its CORS settings,
  and grant browser local-network permission when prompted. Ollama uses
  `OLLAMA_ORIGINS`; LM Studio exposes an Enable CORS setting.
- An optional bearer token stays in memory. Changing the server clears it.
- `localhost` means the device running the browser. Connecting a phone to a
  computer's server requires a reachable address and browser-compatible server
  configuration. HTTP LAN endpoints may be blocked by HTTPS browser policies.
- Local servers can expose cloud-backed models. Users must select a downloaded
  model to keep inference on their device; SAPO does not infer locality from a
  server's model ID.

## Browser models

wllama 3.8.1 is dynamically imported only when loading a model. Its pinned WASM
and compatibility-worker assets are bundled and served by SAPO, without CDN
requests. Inference runs in wllama's worker. Its JavaScript chat binding receives
the same translation instructions as the server's Responses request; no HTTP
server runs in the browser.

Import one instruction-tuned GGUF, or all standard numbered GGUF shards of one
model. Each file must be smaller than 2 GiB. Validate file signatures and shard
completeness before starting the runtime. Users can import several models and
select among them, but only one is loaded at a time. Unsupported architectures,
quantizations, or memory requirements can still prevent loading.

Automatic acceleration uses WebGPU when available; CPU can be selected explicitly.
The WASM CPU path uses one thread, so these pages do not require COOP/COEP headers
that would change the site's auth and popup behavior. Safari/Firefox use wllama's
compatibility runtime when necessary. Browser performance and translation quality
vary by hardware and model.

Local input is limited to 2,000 Unicode characters. Both paths request at most
4,096 output tokens. The browser runtime uses an 8,192-token context and disables
context shifting. A cut-short output is reported as an error. Requests have a
10-minute deadline to allow for slower local inference.

Loading, generation, and unloading are serialized. Stop aborts generation;
changes of provider/model cancel the active translation and discard stale output.
Cancellation during model initialization terminates the candidate worker.
Initialization failures and a five-minute loading deadline release its resources.
A worker crash or generation deadline unloads the failed runtime so the model can
be loaded again. Leaving the translator layout disposes the runtime. Settings
navigation within that layout preserves the loaded model.

## Storage and offline behavior

Only validated settings are persisted in `sapo.local-models.v1`, shared by the web
and PWA on the same origin. API keys, file handles/bytes, input, and output are
never persisted. Imported files must be selected again after a page reload.

Once a browser model is loaded, translation works without an internet connection
while the page stays open. Server mode works while the configured server remains
reachable. The PWA retains its existing static offline landing page; this feature
does not cache authenticated HTML or make a fresh offline launch load the full
translator.

## Verification

`bun run --filter @sapo/web test` covers SSE framing, Unicode, errors, cancellation,
no-account routing, model discovery races, validated persistence, file validation,
and late browser model loads. `bun run build:web` and `verify:build` check deployed
assets, SSR, route namespaces, and existing public content.

For manual checks, exercise both `/` and `/pwa/` while signed out: discover/select a
server model, translate, stop and repeat, change providers, import/load a GGUF,
return from Settings, translate with the network disabled, unload, and reload the
page. Confirm that reload retains settings but clears keys and imported models.
