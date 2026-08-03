export const APP_ROUTE_NAMES = {
    DELETE_ACCOUNT: "delete-account",
    SETTINGS_MODAL: "settings-modal",
} as const;

export const SETTINGS_ROUTES = {
    ROOT: {
        name: "index",
        href: "/settings-modal",
        title: "Settings",
    },
    DATA_CONTROLS: {
        name: "data-controls",
        href: "/settings-modal/data-controls",
        title: "Data controls",
    },
    LOCAL_MODELS: {
        name: "local-models",
        href: "/settings-modal/local-models",
        title: "Local models",
    },
    SUBSCRIPTION: {
        name: "subscription",
        href: "/settings-modal/subscription",
        title: "Subscription",
    },
} as const;

export const APP_ROUTES = {
    HOME: "/",
    AUTH: "/auth",
    SETTINGS: SETTINGS_ROUTES.ROOT.href,
    DATA_CONTROLS: SETTINGS_ROUTES.DATA_CONTROLS.href,
    LOCAL_MODELS: SETTINGS_ROUTES.LOCAL_MODELS.href,
    SUBSCRIPTION: SETTINGS_ROUTES.SUBSCRIPTION.href,
} as const;
