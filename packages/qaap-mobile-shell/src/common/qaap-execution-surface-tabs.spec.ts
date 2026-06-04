// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    EXECUTION_SURFACE_TAB_IDS,
    layoutExecutionSurfaceTabs,
    PINNED_EXECUTION_SURFACE_TAB,
    rankExecutionSurfaceTabs,
    recordExecutionSurfaceTabUse,
} from './qaap-execution-surface-tabs';

describe('qaap-execution-surface-tabs', () => {

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

    it('pins Chat first and defaults the rotating slot to Plan', () => {
        const layout = rankExecutionSurfaceTabs({});
        expect(layout.visible).to.deep.equal(['messages', 'plan']);
        expect(layout.overflow).to.deep.equal(['review', 'preview', 'files', 'terminal']);
    });

    it('keeps Chat fixed and rotates only the second slot by usage', () => {
        const layout = rankExecutionSurfaceTabs({
            terminal: 12,
            review: 9,
            preview: 4,
            messages: 1,
        });
        expect(layout.visible).to.deep.equal(['messages', 'terminal']);
        expect(layout.overflow).to.include('plan');
        expect(layout.overflow).to.not.include('messages');
        expect(layout.overflow).to.include('review');
        expect(layout.overflow).to.include('preview');
    });

    it('promotes the active tab into the rotating slot when it would otherwise overflow', () => {
        const layout = rankExecutionSurfaceTabs({
            terminal: 12,
            review: 9,
            preview: 4,
        }, 'files');
        expect(layout.visible).to.deep.equal(['messages', 'files']);
        expect(layout.overflow).to.not.include('files');
        expect(layout.visible[0]).to.equal(PINNED_EXECUTION_SURFACE_TAB);
    });

    it('uses usage for the rotating slot while Chat is active', () => {
        const layout = rankExecutionSurfaceTabs({
            terminal: 12,
            review: 9,
            preview: 4,
        }, 'messages');
        expect(layout.visible).to.deep.equal(['messages', 'terminal']);
    });

    it('persists usage increments', () => {
        recordExecutionSurfaceTabUse('terminal');
        recordExecutionSurfaceTabUse('terminal');
        recordExecutionSurfaceTabUse('plan');
        const layout = layoutExecutionSurfaceTabs('messages');
        expect(layout.visible).to.deep.equal(['messages', 'terminal']);
        expect(layout.overflow).to.include('plan');
        expect(layout.overflow).to.include('review');
        expect(EXECUTION_SURFACE_TAB_IDS).to.have.length(6);
    });
});
