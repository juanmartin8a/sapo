import { afterEach, expect, it, jest } from '@jest/globals';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Platform, StyleSheet, TextInput } from 'react-native';
import SelectableText from '../SelectableText';

let renderer;
afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.restoreAllMocks();
});

it('remeasures an unchanged response when native fields are recycled across mode switches', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const text = 'First line\nMiddle line\nLast line';
    const fullHeight = 94.5;
    // Fabric retains the last emitted content size when recycling a TextInput.
    let previousNativeHeight = fullHeight;
    const measurement = () => renderer.root.findAllByType(TextInput)
        .find(input => input.props.onContentSizeChange);
    const visible = () => renderer.root.findAllByType(TextInput)
        .find(input => input.props.accessibilityLabel === 'Response');
    const nativeLayout = () => {
        const input = measurement();
        const height = input.props.value ? fullHeight : 29;
        act(() => {
            if (height !== previousNativeHeight) {
                previousNativeHeight = height;
                input.props.onContentSizeChange({ nativeEvent: { contentSize: { width: 300, height } } });
            }
            input.props.onLayout?.({ nativeEvent: { layout: { width: 300, height } } });
        });
    };

    // HomeScreen remounts the response in both directions; reuse the native cache.
    for (const mode of ['paged', 'single', 'paged', 'single']) {
        act(() => {
            renderer = create(<SelectableText key={mode} text={text} accessibilityLabel="Response" />);
        });
        expect(visible().props.value).toBe(text);
        nativeLayout();
        nativeLayout();
        expect(StyleSheet.flatten(visible().props.style).minHeight).toBe(Math.ceil(fullHeight));
        expect(visible().props.scrollEnabled).toBe(false);
        act(() => renderer.unmount());
        renderer = undefined;
    }
});
