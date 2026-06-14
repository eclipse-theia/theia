// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    markMobileProjectsHomeVisible,
    markPreferAgentsSurface,
    shouldBootstrapMobileAgentsChat,
    shouldPreferWorkHubAgentsLayout,
} from '../browser/mobile-projects-open';

describe('mobile-projects-open work hub bootstrap', () => {

    const storage = new Map<string, string>();

    beforeEach(() => {
        storage.clear();
        const sessionStorage = {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => { storage.set(key, value); },
            removeItem: (key: string) => { storage.delete(key); },
            clear: () => { storage.clear(); },
            key: () => null,
            length: 0,
        };
        (global as unknown as { sessionStorage: Storage }).sessionStorage = sessionStorage as Storage;
        (global as unknown as { window: Window & { location: { hash: string } } }).window = {
            location: { hash: '#/Users/jc/.qaap/workspaces/demo/Mockup' },
            sessionStorage,
        } as unknown as Window;
    });

    it('bootstraps agents chat for workspace routes even without persisted agents preference', () => {
        expect(shouldBootstrapMobileAgentsChat()).to.equal(true);
        expect(shouldPreferWorkHubAgentsLayout()).to.equal(false);
    });

    it('bootstraps agents chat for workspace routes even when homeVisible is stale in sessionStorage', () => {
        markMobileProjectsHomeVisible();
        expect(shouldBootstrapMobileAgentsChat()).to.equal(true);
    });

    it('prefers agents surface persistence when no workspace route is targeted', () => {
        (global as unknown as { window: Window & { location: { hash: string } } }).window = {
            location: { hash: '' },
            sessionStorage: (global as unknown as { sessionStorage: Storage }).sessionStorage,
        } as unknown as Window;
        markPreferAgentsSurface();
        expect(shouldBootstrapMobileAgentsChat()).to.equal(true);
        expect(shouldPreferWorkHubAgentsLayout()).to.equal(true);
    });

    it('keeps the home landing when homeVisible is set without a workspace route', () => {
        (global as unknown as { window: Window & { location: { hash: string } } }).window = {
            location: { hash: '' },
            sessionStorage: (global as unknown as { sessionStorage: Storage }).sessionStorage,
        } as unknown as Window;
        markMobileProjectsHomeVisible();
        expect(shouldBootstrapMobileAgentsChat()).to.equal(false);
    });

});
