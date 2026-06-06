// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    clearPreferAgentsSurface,
    clearPreferDesktopIde,
    hasWorkspaceRouteInUrl,
    markPreferAgentsSurface,
    markPreferDesktopIde,
    peekPreferAgentsSurface,
    peekPreferDesktopIde,
} from './qaap-mobile-work-surface-preference';

describe('qaap-mobile-work-surface-preference', () => {

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
        (global as unknown as { window: Window }).window = { sessionStorage } as unknown as Window;
    });

    it('keeps the desktop IDE preference only in runtime memory', () => {
        expect(peekPreferDesktopIde()).to.equal(false);
        markPreferDesktopIde();
        expect(peekPreferDesktopIde()).to.equal(true);
        expect(storage.has('qaap.mobileProjects.preferDesktopIde')).to.equal(false);
        expect(peekPreferAgentsSurface()).to.equal(false);
        clearPreferDesktopIde();
        expect(peekPreferDesktopIde()).to.equal(false);
    });

    it('persists the Agents surface after leaving desktop IDE', () => {
        markPreferDesktopIde();
        clearPreferDesktopIde();
        markPreferAgentsSurface();
        expect(peekPreferAgentsSurface()).to.equal(true);
        expect(peekPreferDesktopIde()).to.equal(false);
        clearPreferAgentsSurface();
        expect(peekPreferAgentsSurface()).to.equal(false);
    });

    it('does not override an explicit desktop IDE choice', () => {
        markPreferDesktopIde();
        markPreferAgentsSurface();
        expect(peekPreferDesktopIde()).to.equal(true);
        expect(peekPreferAgentsSurface()).to.equal(false);
    });

    it('detects workspace routes in the URL hash', () => {
        (global as unknown as { window: Window & { location: { hash: string } } }).window = {
            location: { hash: '#/Users/jc/.qaap/workspaces/demo/Mockup' },
            sessionStorage: (global as unknown as { sessionStorage: Storage }).sessionStorage,
        } as Window;
        expect(hasWorkspaceRouteInUrl()).to.equal(true);
    });

});
