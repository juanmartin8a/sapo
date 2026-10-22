import { createFileRoute } from "@tanstack/solid-router";
import DeleteAccountPage from "@/components/site/DeleteAccountPage";
export const Route = createFileRoute("/_site/delete-account")({
    head: () => ({
        meta: [
            { title: "Delete Account | S A P O" },
            {
                name: "description",
                content:
                    "Learn how to delete your SAPO account from the app or contact SAPO support for help.",
            },
        ],
    }),
    component: DeleteAccountPage,
});
