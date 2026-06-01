// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    readStoredComposerSurface,
    scopedComposerSurfaceStorageKey,
    writeStoredComposerSurface,
} from './qaap-composer-surface';

describe('qaap-composer-surface', () => {

    const storage = new Map<string, string>();

    beforeEach(() => {
        storage.clear();
        (global as unknown as { window: Window }).window = {
            localStorage: {
                getItem: (key: string) => storage.get(key) ?? null,
                setItem: (key: string, value: string) => { storage.set(key, value); },
                removeItem: (key: string) => { storage.delete(key); },
                clear: () => { storage.clear(); },
                key: () => null,
                length: 0,
            },
        } as unknown as Window;
    });

    it('scopes the storage key per cwd', () => {
        expect(scopedComposerSurfaceStorageKey('/repo/a')).to.contain('/repo/a');
        expect(scopedComposerSurfaceStorageKey('/repo/a')).to.not.equal(scopedComposerSurfaceStorageKey('/repo/b'));
    });

    it('never resolves to the removed Chat surface', () => {
        // The mobile shell only exposes the agentic Task surface; legacy 'chat' values are ignored
        // so callers fall back to 'task'.
        writeStoredComposerSurface('/repo/a', 'chat');
        writeStoredComposerSurface('/repo/b', 'task');
        expect(readStoredComposerSurface('/repo/a')).to.equal(undefined);
        expect(readStoredComposerSurface('/repo/b')).to.equal(undefined);
    });

});
