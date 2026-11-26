// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { expect } from 'chai';
import type { TerminalWidget } from './base/terminal-widget.js';

describe('TerminalFrontendContribution', () => {

    let disableJSDOM: () => void;
    let TerminalFrontendContribution: typeof import('./terminal-frontend-contribution.js').TerminalFrontendContribution;

    before(async () => {
        // the contribution's modules need the DOM when they are loaded
        disableJSDOM = enableJSDOM();
        ({ TerminalFrontendContribution } = await import('./terminal-frontend-contribution.js'));
    });

    after(() => {
        disableJSDOM();
    });

    it('adds the terminal of the default layout without waiting for its process to start', async () => {
        const contribution = new TerminalFrontendContribution();
        const started = new Deferred<void>();
        const widget = { start: () => started.promise } as unknown as TerminalWidget;
        const added: unknown[] = [];
        Object.assign(contribution, {
            preferenceService: { ready: Promise.resolve(), get: () => undefined },
            shell: { addWidget: (candidate: unknown) => { added.push(candidate); } },
            logger: new MockLogger(),
            newTerminal: async () => widget
        });
        await contribution.initializeLayout();
        expect(added).to.deep.equal([widget]);
        started.resolve();
    });

    it('merges the profile settings once after the workspace trust is known', async () => {
        const contribution = new TerminalFrontendContribution();
        const trust = new Deferred<boolean>();
        let merges = 0;
        Object.assign(contribution, {
            workspaceTrustService: { getWorkspaceTrust: () => trust.promise },
            mergePreferences: async () => { merges++; },
            logger: new MockLogger()
        });
        const first = contribution.whenProfilesApplied();
        const second = contribution.whenProfilesApplied();
        await new Promise(resolve => setTimeout(resolve));
        expect(merges).to.equal(0);
        trust.resolve(true);
        await Promise.all([first, second]);
        expect(merges).to.equal(1);
    });

    it('merges the profile settings after an earlier merge failed', async () => {
        const contribution = new TerminalFrontendContribution();
        let merges = 0;
        Object.assign(contribution, {
            workspaceTrustService: { getWorkspaceTrust: async () => true },
            mergePreferences: async () => {
                if (merges++ === 0) {
                    throw new Error('variable not resolved');
                }
            },
            logger: new MockLogger()
        });
        const failed = (contribution as unknown as { queueMergePreferences(): Promise<void> }).queueMergePreferences();
        await failed.catch(() => undefined);
        // resolves, without the error of the earlier merge
        await (contribution as unknown as { queueMergePreferences(): Promise<void> }).queueMergePreferences();
        expect(merges).to.equal(2);
    });
});
