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

    it('persists surface per cwd scope', () => {
        writeStoredComposerSurface('/repo/a', 'chat');
        writeStoredComposerSurface('/repo/b', 'task');
        expect(readStoredComposerSurface('/repo/a')).to.equal('chat');
        expect(readStoredComposerSurface('/repo/b')).to.equal('task');
        expect(scopedComposerSurfaceStorageKey('/repo/a')).to.contain('/repo/a');
    });

});
