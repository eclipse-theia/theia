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
});
