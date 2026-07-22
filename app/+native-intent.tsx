export function redirectSystemPath({ path }: { path: string }) {
    try {
        const url = new URL(path, 'sapo://');

        if (url.hostname === 'auth' || url.pathname === '/auth') {
            return '/';
        }

        return path;
    } catch {
        return path;
    }
}
