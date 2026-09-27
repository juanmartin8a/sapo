import { beforeEach, describe, expect, it } from '@jest/globals';
import usePagerStore from '../pagerStore';
import useTranslateButtonStore from '../translateButtonStore';

beforeEach(() => {
    usePagerStore.setState({ singleScreen: false, pos: 0, newPos: 0 });
    useTranslateButtonStore.setState({ state: 'next' });
});

describe('single screen mode', () => {
    it('returns to input and clears pending response navigation', () => {
        usePagerStore.getState().setPos(1);
        expect(useTranslateButtonStore.getState().state).toBe('repeat');

        usePagerStore.getState().setSingleScreen(true);

        expect(usePagerStore.getState()).toMatchObject({ pos: 0, newPos: 0 });
        expect(useTranslateButtonStore.getState().state).toBe('next');
    });

    it('ignores response navigation until two-page mode is restored', () => {
        usePagerStore.getState().setSingleScreen(true);
        usePagerStore.getState().goToPage(1);
        usePagerStore.getState().setPos(1);
        expect(usePagerStore.getState()).toMatchObject({ pos: 0, newPos: 0 });

        usePagerStore.getState().setSingleScreen(false);
        usePagerStore.getState().goToPage(1);
        expect(usePagerStore.getState().newPos).toBe(1);
    });

    it('does not reset navigation when the layout setting is unchanged', () => {
        usePagerStore.getState().setPos(1);
        usePagerStore.getState().setSingleScreen(false);
        expect(usePagerStore.getState().pos).toBe(1);
        expect(useTranslateButtonStore.getState().state).toBe('repeat');
    });

    it('preserves the stop action when toggled during a response', () => {
        usePagerStore.getState().setPos(1);
        useTranslateButtonStore.setState({ state: 'stop' });
        usePagerStore.getState().setSingleScreen(true);
        expect(useTranslateButtonStore.getState().state).toBe('stop');
    });
});
