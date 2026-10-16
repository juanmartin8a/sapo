const APPLE_BASE_URL = "https://appleid.apple.com";
const APPLE_TOKEN_URL = `${APPLE_BASE_URL}/auth/token`;
const APPLE_TOKEN_REVOCATION_URL = `${APPLE_BASE_URL}/auth/revoke`;
const APPLE_CLIENT_SECRET_AGE_SECONDS = 60 * 60;
const TRANSIENT_REVOKE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

type AppleTokenResponse = {
    access_token?: unknown;
    expires_in?: unknown;
    id_token?: unknown;
    refresh_token?: unknown;
};

type JwtClaims = {
    aud?: unknown;
    sub?: unknown;
};

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64UrlEncode(bytes: Uint8Array) {
    let output = "";

    for (let index = 0; index < bytes.length; index += 3) {
        const byte1 = bytes[index];
        const byte2 = bytes[index + 1] ?? 0;
        const byte3 = bytes[index + 2] ?? 0;
        const triplet = (byte1 << 16) | (byte2 << 8) | byte3;

        output += BASE64_ALPHABET[(triplet >> 18) & 63];
        output += BASE64_ALPHABET[(triplet >> 12) & 63];
        output += index + 1 < bytes.length ? BASE64_ALPHABET[(triplet >> 6) & 63] : "=";
        output += index + 2 < bytes.length ? BASE64_ALPHABET[triplet & 63] : "=";
    }

    return output.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64Decode(value: string) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const bytes: number[] = [];

    for (let index = 0; index < padded.length; index += 4) {
        const chunk = padded.slice(index, index + 4);
        const sextets = [...chunk].map((char) => (char === "=" ? 0 : BASE64_ALPHABET.indexOf(char)));

        if (sextets.some((sextet) => sextet < 0)) {
            throw new Error("Invalid base64 value");
        }

        const triplet = (sextets[0] << 18) | (sextets[1] << 12) | (sextets[2] << 6) | sextets[3];
        bytes.push((triplet >> 16) & 255);

        if (chunk[2] !== "=") {
            bytes.push((triplet >> 8) & 255);
        }

        if (chunk[3] !== "=") {
            bytes.push(triplet & 255);
        }
    }

    return new Uint8Array(bytes);
}

function decodeUtf8(bytes: Uint8Array) {
    return new TextDecoder().decode(bytes);
}

function encodeJson(value: unknown) {
    return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

function normalizePrivateKey(privateKey: string) {
    return privateKey.replace(/\\n/g, "\n").trim();
}

function getPkcs8PrivateKeyBytes(privateKey: string) {
    const pem = normalizePrivateKey(privateKey);
    const base64 = pem
        .replace("-----BEGIN PRIVATE KEY-----", "")
        .replace("-----END PRIVATE KEY-----", "")
        .replace(/\s/g, "");

    if (!base64) {
        throw new Error("Invalid Sign in with Apple private key");
    }

    return base64Decode(base64);
}

function requireAppleEnv(name: "APPLE_CLIENT_ID" | "APPLE_APP_BUNDLE_IDENTIFIER" | "APPLE_TEAM_ID" | "APPLE_KEY_ID" | "APPLE_PRIVATE_KEY") {
    const value =
        name === "APPLE_CLIENT_ID"
            ? process.env.APPLE_CLIENT_ID
            : name === "APPLE_APP_BUNDLE_IDENTIFIER"
              ? process.env.APPLE_APP_BUNDLE_IDENTIFIER
              : name === "APPLE_TEAM_ID"
                ? process.env.APPLE_TEAM_ID
                : name === "APPLE_KEY_ID"
                  ? process.env.APPLE_KEY_ID
                  : process.env.APPLE_PRIVATE_KEY;

    if (!value) {
        throw new Error(`Missing Sign in with Apple environment variable: ${name}`);
    }

    return value;
}

export function getAppleWebClientId() {
    return requireAppleEnv("APPLE_CLIENT_ID");
}

export function getAppleNativeClientId() {
    return requireAppleEnv("APPLE_APP_BUNDLE_IDENTIFIER");
}

export async function generateAppleClientSecret(clientId: string) {
    const teamId = requireAppleEnv("APPLE_TEAM_ID");
    const keyId = requireAppleEnv("APPLE_KEY_ID");
    const privateKey = requireAppleEnv("APPLE_PRIVATE_KEY");
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAtSeconds = nowSeconds + APPLE_CLIENT_SECRET_AGE_SECONDS;
    const key = await crypto.subtle.importKey(
        "pkcs8",
        getPkcs8PrivateKeyBytes(privateKey),
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"]
    );
    const header = encodeJson({ alg: "ES256", kid: keyId });
    const payload = encodeJson({
        iss: teamId,
        iat: nowSeconds,
        exp: expiresAtSeconds,
        aud: APPLE_BASE_URL,
        sub: clientId,
    });
    const signingInput = `${header}.${payload}`;
    const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        new TextEncoder().encode(signingInput)
    );

    return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export function decodeJwtClaims(token: string): JwtClaims {
    const [, payload] = token.split(".");

    if (!payload) {
        throw new Error("Invalid JWT payload");
    }

    const value = JSON.parse(decodeUtf8(base64Decode(payload))) as JwtClaims;

    if (typeof value !== "object" || value === null) {
        throw new Error("Invalid JWT claims");
    }

    return value;
}

function getStringField(value: unknown, field: keyof AppleTokenResponse) {
    const fieldValue = (value as AppleTokenResponse)[field];

    return typeof fieldValue === "string" && fieldValue.length > 0 ? fieldValue : null;
}

export async function exchangeNativeAppleAuthorizationCode(authorizationCode: string) {
    const clientId = getAppleNativeClientId();
    const clientSecret = await generateAppleClientSecret(clientId);
    const response = await fetch(APPLE_TOKEN_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code: authorizationCode,
            grant_type: "authorization_code",
        }),
    });

    if (!response.ok) {
        const responseText = await response.text().catch(() => "");
        throw new Error(`Sign in with Apple authorization code exchange failed with status ${response.status}: ${responseText}`);
    }

    const tokenResponse = (await response.json()) as AppleTokenResponse;
    const refreshToken = getStringField(tokenResponse, "refresh_token");
    const idToken = getStringField(tokenResponse, "id_token");

    if (!refreshToken || !idToken) {
        throw new Error("Sign in with Apple authorization code exchange did not return revocable tokens");
    }

    const accessToken = getStringField(tokenResponse, "access_token");
    const expiresIn = typeof tokenResponse.expires_in === "number" ? tokenResponse.expires_in : null;

    return {
        accessToken,
        accessTokenExpiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null,
        idToken,
        refreshToken,
    };
}

function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function revokeAppleToken(args: {
    clientId: string;
    token: string;
    tokenTypeHint: "access_token" | "refresh_token";
}) {
    const clientSecret = await generateAppleClientSecret(args.clientId);
    let lastStatus: number | null = null;
    let lastResponseText = "";

    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const response = await fetch(APPLE_TOKEN_REVOCATION_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    client_id: args.clientId,
                    client_secret: clientSecret,
                    token: args.token,
                    token_type_hint: args.tokenTypeHint,
                }),
            });

            if (response.ok) {
                return;
            }

            lastStatus = response.status;
            lastResponseText = await response.text().catch(() => "");

            if (!TRANSIENT_REVOKE_STATUS_CODES.has(response.status) || attempt === 2) {
                break;
            }
        } catch (error) {
            if (attempt === 2) {
                throw error;
            }
        }

        await wait(250 * (attempt + 1));
    }

    throw new Error(
        `Sign in with Apple ${args.tokenTypeHint} revocation failed${
            lastStatus ? ` with status ${lastStatus}` : ""
        }${lastResponseText ? `: ${lastResponseText}` : ""}`
    );
}
