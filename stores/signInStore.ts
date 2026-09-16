import { create } from 'zustand';

import type { SignInMethod } from '@/types/auth';

type SignInState = {
    pendingProvider: SignInMethod | null;
    start: (provider: SignInMethod) => void;
    end: (provider: SignInMethod) => void;
    reset: () => void;
};

export const useSignInStore = create<SignInState>((set) => ({
    pendingProvider: null,
    start: (provider) => set({ pendingProvider: provider }),
    end: (provider) => set((state) => (
        state.pendingProvider === provider ? { pendingProvider: null } : state
    )),
    reset: () => set({ pendingProvider: null }),
}));
