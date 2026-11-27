// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import type { TerminalWidgetImpl } from './terminal-widget-impl.js';

describe('TerminalWidgetImpl', () => {

    let disableJSDOM: () => void;
    let TerminalWidgetImplClass: typeof TerminalWidgetImpl;

    before(async () => {
        // the widget's modules need the DOM when they are loaded
        disableJSDOM = enableJSDOM();
        ({ TerminalWidgetImpl: TerminalWidgetImplClass } = await import('./terminal-widget-impl.js'));
    });

    after(() => {
        disableJSDOM();
    });

    function createWidget(trust: Promise<boolean>, created: string[]): TerminalWidgetImpl {
        const widget = Object.create(TerminalWidgetImplClass.prototype) as TerminalWidgetImpl;
        Object.assign(widget, {
            options: {},
            term: { cols: 80, rows: 24 },
            logger: new MockLogger(),
            preferences: {},
            workspaceTrustService: { getWorkspaceTrust: () => trust },
            workspaceService: { roots: Promise.resolve([]) },
            shellTerminalServer: {
                create: async (options: { shell?: string }) => {
                    created.push(options.shell ?? '');
                    return 1;
                },
                getProcessInfo: async () => ({ executable: 'test-shell', arguments: [] })
            }
        });
        return widget;
    }

    it('should create the terminal process once the workspace trust is known', async () => {
        const trust = new Deferred<boolean>();
        const created: string[] = [];
        const widget = createWidget(trust.promise, created);
        const terminalId = (widget as unknown as { createTerminal(): Promise<number> }).createTerminal();
        await new Promise(resolve => setTimeout(resolve));
        expect(created).to.be.empty;
        trust.resolve(true);
        expect(await terminalId).to.equal(1);
        expect(created).to.have.lengthOf(1);
    });

    it('should not create a terminal process for a widget closed while the workspace trust is not known', async () => {
        const trust = new Deferred<boolean>();
        const created: string[] = [];
        const widget = createWidget(trust.promise, created);
        const terminalId = widget.start();
        Object.defineProperty(widget, 'isDisposed', { value: true });
        trust.resolve(true);
        expect(await terminalId).to.equal(-1);
        expect(created).to.be.empty;
    });
});
