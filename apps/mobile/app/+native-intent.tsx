import { APP_ROUTES, APP_SCHEME } from "@/constants/routes";

export function redirectSystemPath({ path }: { path: string }) {
    try {
        const url = new URL(path, `${APP_SCHEME}://`);
        const authHostname = APP_ROUTES.AUTH.slice(1);

        if (url.hostname === authHostname || url.pathname === APP_ROUTES.AUTH) {
            return APP_ROUTES.HOME;
        }

        return path;
    } catch {
        return path;
    }
}
