export const APP_SCHEME = "sapo";

export const APP_ROUTE_NAMES = {
    DELETE_ACCOUNT: "delete-account",
    SETTINGS_MODAL: "settings-modal",
} as const;

const SETTINGS_ROUTE_PREFIX = `/${APP_ROUTE_NAMES.SETTINGS_MODAL}` as const;
const SETTINGS_ROUTE_NAMES = {
    ROOT: "index",
    DATA_CONTROLS: "data-controls",
    LOCAL_MODELS: "local-models",
    SUBSCRIPTION: "subscription",
} as const;

export const SETTINGS_ROUTES = {
    ROOT: {
        name: SETTINGS_ROUTE_NAMES.ROOT,
        href: SETTINGS_ROUTE_PREFIX,
        title: "Settings",
    },
    DATA_CONTROLS: {
        name: SETTINGS_ROUTE_NAMES.DATA_CONTROLS,
        href: `${SETTINGS_ROUTE_PREFIX}/${SETTINGS_ROUTE_NAMES.DATA_CONTROLS}`,
        title: "Data controls",
    },
    LOCAL_MODELS: {
        name: SETTINGS_ROUTE_NAMES.LOCAL_MODELS,
        href: `${SETTINGS_ROUTE_PREFIX}/${SETTINGS_ROUTE_NAMES.LOCAL_MODELS}`,
        title: "Local models",
    },
    SUBSCRIPTION: {
        name: SETTINGS_ROUTE_NAMES.SUBSCRIPTION,
        href: `${SETTINGS_ROUTE_PREFIX}/${SETTINGS_ROUTE_NAMES.SUBSCRIPTION}`,
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
