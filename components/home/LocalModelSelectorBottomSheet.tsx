import { LOCAL_TRANSLATION_MODELS, type LocalTranslationModelId } from "@/clients/local-model";
import useHomeBottomSheetNotifier from "@/stores/homeBottomSheetNotifierStore";
import useLocalModelStore from "@/stores/localModelStore";
import useSidebarIsOpenNotifier from "@/stores/sidebarIsOpenNotifierStore";
import BottomSheet from "@gorhom/bottom-sheet";
import { useCallback, useEffect, useRef } from "react";
import LangugeSelectorBottomSheetUI from "./LanguageSelectorBottomSheetUI";

const SHEET_KEY = "local_model_selector";

export default function LocalModelSelectorBottomSheet() {
    const sheetRef = useRef<BottomSheet>(null);
    const isClosed = useRef<boolean>(true);
    const initSnapSuccess = useRef<boolean>(false);
    const selectedModelId = useLocalModelStore((state) => state.selectedModelId);
    const selectModel = useLocalModelStore((state) => state.selectModel);
    const sidebarIsOpen = useSidebarIsOpenNotifier(state => state.isOpen);

    useEffect(() => {
        const unsub = useHomeBottomSheetNotifier.subscribe((state) => {
            if (
                (state.bottomSheet === SHEET_KEY || state.bottomSheet === undefined) &&
                state.bottomSheetToOpen === SHEET_KEY &&
                state.loading === true
            ) {
                sheetRef.current?.snapToIndex(0);
            } else if (
                state.bottomSheet === SHEET_KEY &&
                state.bottomSheetToOpen !== SHEET_KEY &&
                state.loading === true
            ) {
                sheetRef.current?.close();
            }
        })

        return () => unsub();
    }, []);

    useEffect(() => {
        if (!sidebarIsOpen && !isClosed.current) {
            sheetRef.current?.close();
        }
    }, [sidebarIsOpen]);

    const handleSheetClose = useCallback(() => {
        isClosed.current = true;

        if (!initSnapSuccess.current) {
            useHomeBottomSheetNotifier.getState().bottomSheetClosed(true)
            return;
        }

        initSnapSuccess.current = false;

        const { bottomSheet, bottomSheetToOpen } = useHomeBottomSheetNotifier.getState();

        if (
            bottomSheet === SHEET_KEY &&
            bottomSheetToOpen !== SHEET_KEY
        ) {
            useHomeBottomSheetNotifier.getState().bottomSheetClosed()
        }
    }, [])

    const handleSheetChange = useCallback((index: number) => {
        if (index > -1) {
            initSnapSuccess.current = true;
            isClosed.current = false;

            const { bottomSheet, bottomSheetToOpen, loading } = useHomeBottomSheetNotifier.getState();

            if (
                (bottomSheet === SHEET_KEY || bottomSheet === undefined) &&
                bottomSheetToOpen === SHEET_KEY &&
                loading === true
            ) {
                useHomeBottomSheetNotifier.getState().bottomSheetOpened()
            }
        }
    }, [])

    const handleModelSelect = (key: string) => {
        const modelId = key as LocalTranslationModelId;
        void selectModel(modelId === selectedModelId ? null : modelId);
    }

    return (
        <LangugeSelectorBottomSheetUI
            selectedKey={selectedModelId ?? ""}
            ref={sheetRef}
            onLanguageSelected={handleModelSelect}
            onClose={handleSheetClose}
            onChange={handleSheetChange}
            data={LOCAL_TRANSLATION_MODELS.map((model) => [model.id, model.displayName] as [string, string])}
        />
    );
}
