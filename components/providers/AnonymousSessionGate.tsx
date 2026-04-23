import type { PropsWithChildren } from "react";
import { useEffect } from "react";

import { authClient, warmAnonymousSession } from "@/clients/auth-client";

export default function AnonymousSessionGate({
    children,
}: PropsWithChildren) {
    const { data: session, isPending } = authClient.useSession();

    useEffect(() => {
        if (session || isPending) {
            return;
        }

        void warmAnonymousSession();
    }, [isPending, session]);

    return <>{children}</>;
}
