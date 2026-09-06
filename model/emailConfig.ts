// Preserve live sending unless a deployment explicitly enables test mode.
export function getEmailTestMode() {
    const value = process.env.EMAIL_TEST_MODE;
    if (value === undefined || value === "false") return false;
    if (value === "true") return true;
    throw new Error("EMAIL_TEST_MODE must be true or false");
}
