// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    QAAP_SESSIONS_SIDEBAR_DISMISS_HINT_KEY,
    hasSeenSessionsSidebarDismissHint,
    markSessionsSidebarDismissHintSeen,
} from './mobile-work-hub-sessions-sidebar';

describe('mobile-work-hub-sessions-sidebar', () => {

    const storage = new Map<string, string>();

    beforeEach(() => {
        storage.clear();
        (global as { window?: Window }).window = {
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

    afterEach(() => {
        delete (global as { window?: Window }).window;
    });

    it('shows dismiss hint only until marked seen', () => {
        expect(hasSeenSessionsSidebarDismissHint()).to.equal(false);
        markSessionsSidebarDismissHintSeen();
        expect(storage.get(QAAP_SESSIONS_SIDEBAR_DISMISS_HINT_KEY)).to.equal('1');
        expect(hasSeenSessionsSidebarDismissHint()).to.equal(true);
    });

});
