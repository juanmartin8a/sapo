import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import React from 'react';
import { act, create } from 'react-test-renderer';
import Translate from '../Translate';
import useTranslationStore from '@/stores/translationStore';

const mockScrollTo = jest.fn();
const mockScrollToEnd = jest.fn();
jest.mock('react-native', () => {
    const actual = jest.requireActual('react-native');
    const React = require('react');
    const mocked = Object.defineProperties({}, Object.getOwnPropertyDescriptors(actual));
    Object.defineProperty(mocked, 'ScrollView', { value: React.forwardRef(function MockScrollView(props, ref) {
            React.useImperativeHandle(ref, () => ({ scrollTo: mockScrollTo, scrollToEnd: mockScrollToEnd }));
            return <actual.View {...props} testID="response-scroll" />;
        }) });
    return mocked;
});
jest.mock('../SelectableText', () => 'SelectableText');
jest.mock('../TranslationPreview', () => 'TranslationPreview');
jest.mock('@/lib/haptics', () => ({ triggerLightImpactHaptic: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('react-native-reanimated', () => ({
    __esModule: true,
    default: { View: require('react-native').View, Image: require('react-native').Image },
    useSharedValue: (initial) => require('react').useRef({ get: () => initial, set: jest.fn() }).current,
    useAnimatedStyle: (callback) => callback(),
    cancelAnimation: jest.fn(),
    withDelay: jest.fn(),
    withTiming: jest.fn(),
}));
jest.mock('@/stores/translationStore', () => ({
    __esModule: true,
    default: require('zustand').create(() => ({})),
}));
let renderer;
const scroll = () => renderer.root.findByProps({ testID: 'response-scroll' });
const scrollUp = () => scroll().props.onScroll({ nativeEvent: {
    contentOffset: { y: 100 }, contentSize: { height: 1500 }, layoutMeasurement: { height: 500 },
} });
beforeEach(() => {
    useTranslationStore.setState({ displayText: 'Previous long response', translationPreview: '',
        isCombinedResponse: false, activeStreamId: null, isStreaming: false,
        mouthTriggerVersion: 0, streamStartVersion: 0, streamError: false });
    act(() => { renderer = create(<Translate />); });
    jest.clearAllMocks();
});
afterEach(() => act(() => renderer.unmount()));

it('resets before tokens arrive and resumes following after stale scroll events', () => {
    act(scrollUp);
    act(() => useTranslationStore.setState({ displayText: '', activeStreamId: 'next', isStreaming: true }));
    expect(mockScrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
    act(scrollUp);
    act(() => scroll().props.onContentSizeChange());
    expect(mockScrollToEnd).not.toHaveBeenCalled();
    act(() => useTranslationStore.setState({ displayText: 'New response' }));
    act(() => scroll().props.onContentSizeChange());
    expect(mockScrollToEnd).toHaveBeenCalledTimes(1);
    act(scrollUp);
    act(() => useTranslationStore.setState({ displayText: 'New response continued' }));
    act(() => scroll().props.onContentSizeChange());
    expect(mockScrollToEnd).toHaveBeenCalledTimes(1);
});

it('resets a new request even when an empty response was already displayed', () => {
    act(() => useTranslationStore.setState({ displayText: '', translationPreview: 'Long preview', isCombinedResponse: true }));
    act(scrollUp);
    mockScrollTo.mockClear();
    act(() => useTranslationStore.setState({ translationPreview: '', activeStreamId: 'retry' }));
    expect(mockScrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
    act(() => useTranslationStore.setState({ translationPreview: 'Next preview' }));
    act(() => scroll().props.onContentSizeChange());
    expect(mockScrollToEnd).toHaveBeenCalledTimes(1);
});

it('resets when request start and its first token are batched, but not at completion', () => {
    act(scrollUp);
    act(() => useTranslationStore.setState({ displayText: 'First token', activeStreamId: 'fast' }));
    expect(mockScrollTo).toHaveBeenCalledTimes(1);
    act(() => useTranslationStore.setState({ activeStreamId: null }));
    expect(mockScrollTo).toHaveBeenCalledTimes(1);
});
