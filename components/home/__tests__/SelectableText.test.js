import { afterEach, expect, it, jest } from '@jest/globals';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Platform, StyleSheet, Text, TextInput } from 'react-native';
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


it('refreshes native height after streamed text layout even when the intrinsic frame is unchanged', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const onTextLayout = jest.fn();
    const render = text => <SelectableText text={text} accessibilityLabel="Response" onTextLayout={onTextLayout} />;
    act(() => { renderer = create(render('DOHN-deh ehs-TAH lah bee-')); });
    const measurement = () => renderer.root.findAllByType(TextInput)
        .find(input => input.props.onContentSizeChange);
    const visible = () => renderer.root.findAllByType(TextInput)
        .find(input => input.props.accessibilityLabel === 'Response');
    const reportHeight = height => measurement().props.onContentSizeChange({
        nativeEvent: { contentSize: { width: 327, height } },
    });
    act(() => measurement().props.onLayout({ nativeEvent: { layout: { width: 327, height: 29 } } }));
    act(() => reportHeight(30));

    // A controlled text update can settle after the initial native layout pass.
    // Fabric won't report the new content size unless layout metrics change again.
    act(() => renderer.update(render('DOHN-deh ehs-TAH lah bee-blyoh-TEH-kah?')));
    const previousFrame = StyleSheet.flatten(measurement().props.style);
    const event = { nativeEvent: { lines: [
        { text: 'DOHN-deh ehs-TAH lah bee-', x: 0, y: 0, width: 290, height: 28.8 },
        { text: 'blyoh-TEH-kah?', x: 0, y: 28.8, width: 140, height: 28.8 },
    ] } };
    act(() => {
        // Multiple queued streaming layouts must not cancel the follow-up pass.
        const handleLayout = renderer.root.findByType(Text).props.onTextLayout;
        handleLayout(event);
        handleLayout(event);
    });
    const nextFrame = StyleSheet.flatten(measurement().props.style);
    if (nextFrame.top !== previousFrame.top) {
        act(() => reportHeight(60));
    }
    expect(StyleSheet.flatten(visible().props.style).minHeight).toBe(60);
    expect(visible().props.value).toBe('DOHN-deh ehs-TAH lah bee-blyoh-TEH-kah?');
    expect(onTextLayout).toHaveBeenCalledWith(event);
    // Measuring must not narrow the field or alter visible positioning.
    expect(nextFrame.left).toBe(previousFrame.left);
    expect(nextFrame.right).toBe(previousFrame.right);
    expect(StyleSheet.flatten(visible().props.style).top).toBeUndefined();

    // A subsequent short response must be allowed to shrink again.
    act(() => renderer.update(render('Hi')));
    const beforeShrink = StyleSheet.flatten(measurement().props.style).top;
    act(() => renderer.root.findByType(Text).props.onTextLayout({ nativeEvent: { lines: [
        { text: 'Hi', x: 0, y: 0, width: 22, height: 28.8 },
    ] } }));
    if (StyleSheet.flatten(measurement().props.style).top !== beforeShrink) {
        act(() => reportHeight(30));
    }
    expect(StyleSheet.flatten(visible().props.style).minHeight).toBe(30);
});
