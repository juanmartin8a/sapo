import { useCallback, useRef } from 'react';
import type { TextInputInstance } from 'react-native';

export default function useTextSelection() {
    const inputRef = useRef<TextInputInstance>(null);
    const dismissSelection = useCallback(() => {
        // Blurring alone can leave the selected range highlighted in a read-only UITextView.
        inputRef.current?.setSelection(0, 0);
        inputRef.current?.blur();
    }, []);

    return { inputRef, dismissSelection };
}
