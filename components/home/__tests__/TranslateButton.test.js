import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import TranslateButton from '../TranslateButton';
import useTranslationInputStore from '@/stores/translationInputStore';
import useTranslateButtonStore from '@/stores/translateButtonStore';
import usePagerStore from '@/stores/pagerStore';
import useTranslationStore from '@/stores/translationStore';
import useTransformationOperationStore from '@/stores/transformationOperationStore';

jest.mock('@/assets/icons/arrow-right.svg', () => 'ArrowIcon');
jest.mock('@/assets/icons/repeat.svg', () => 'RepeatIcon');
jest.mock('@/assets/icons/square.svg', () => 'StopIcon');
jest.mock('@/assets/icons/more-horizontal.svg', () => 'LoadingIcon');
jest.mock('react-native-gesture-handler', () => ({ Pressable: 'Pressable' }));
jest.mock('react-native-reanimated', () => ({
    __esModule: true,
    default: { View: require('react-native').View },
    useAnimatedStyle: (callback) => callback(),
}));
jest.mock('@/providers/AuthStateProvider', () => ({
    useAuthState: () => ({ status: 'authenticated' }),
}));
jest.mock('@/hooks/useSubscriptionAccess', () => ({
    __esModule: true,
    default: () => ({ hasActiveSubscription: true }),
}));
jest.mock('@/stores/localModelStore', () => ({
    __esModule: true,
    default: (selector) => selector({ isEnabled: false }),
}));
jest.mock('@/lib/haptics', () => ({
    triggerErrorHaptic: jest.fn(),
    triggerMediumImpactHaptic: jest.fn(),
}));
jest.mock('@/stores/translationStore', () => ({
    __esModule: true,
    default: require('zustand').create(() => ({
        lastInput: 'Hello',
        sendMessage: jest.fn(),
        stopStream: jest.fn(),
        repeatLastTranslation: jest.fn(),
    })),
}));

let renderer;
beforeEach(() => {
    usePagerStore.setState({ singleScreen: true, pos: 0, newPos: 0 });
    useTranslateButtonStore.setState({ state: 'next' });
    useTranslationInputStore.getState().setText('Hello', 5);
    useTranslationStore.setState({ lastInput: 'Hello' });
    useTransformationOperationStore.setState({ operation: 'translate' });
    jest.clearAllMocks();
});
afterEach(() => {
    act(() => renderer?.unmount());
});

function renderButton(progress = 0) {
    act(() => {
        renderer = create(<TranslateButton pagerProgress={{ get: () => progress }} />);
    });
}

function iconOpacity(name) {
    return StyleSheet.flatten(renderer.root.findByType(name).parent.props.style).opacity;
}

it.each(['translate', 'respell'])('updates the repeat icon and submits edited input for %s', (operation) => {
    useTransformationOperationStore.setState({ operation });
    renderButton();
    expect(iconOpacity('RepeatIcon')).toBe(1);
    expect(iconOpacity('ArrowIcon')).toBe(0);

    act(() => useTranslationInputStore.getState().setText('Edited', 6));
    expect(iconOpacity('RepeatIcon')).toBe(0);
    expect(iconOpacity('ArrowIcon')).toBe(1);
    act(() => renderer.root.findByType('Pressable').props.onPress());
    expect(useTranslationStore.getState().sendMessage).toHaveBeenCalledWith('Edited');

    act(() => useTranslationInputStore.getState().setText('Hello', 5));
    expect(iconOpacity('RepeatIcon')).toBe(1);
});

it('keeps blank input disabled and shows the arrow before any translation', () => {
    useTranslationStore.setState({ lastInput: null });
    useTranslationInputStore.getState().setText('', 0);
    renderButton();
    expect(iconOpacity('ArrowIcon')).toBe(1);
    expect(renderer.root.findByType('Pressable').props.disabled).toBe(true);
});

it('keeps loading and stop controls while input matches', () => {
    useTranslateButtonStore.setState({ state: 'loading' });
    renderButton();
    expect(renderer.root.findAllByType('RepeatIcon')).toHaveLength(0);
    expect(renderer.root.findAllByType('LoadingIcon')).toHaveLength(1);
    act(() => useTranslateButtonStore.setState({ state: 'stop' }));
    expect(renderer.root.findAllByType('StopIcon')).toHaveLength(1);
    act(() => renderer.root.findByType('Pressable').props.onPress());
    expect(useTranslationStore.getState().stopStream).toHaveBeenCalledTimes(1);
});

it('preserves pager-driven icons in two-page mode', () => {
    usePagerStore.setState({ singleScreen: false });
    renderButton(0.75);
    expect(iconOpacity('RepeatIcon')).toBe(0.75);
    expect(iconOpacity('ArrowIcon')).toBe(0.25);
});
