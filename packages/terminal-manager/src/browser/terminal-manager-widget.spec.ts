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
import { expect } from 'chai';
import type { TerminalManagerWidget } from './terminal-manager-widget.js';

describe('TerminalManagerWidget', () => {

    let disableJSDOM: () => void;
    let TerminalManagerWidgetClass: typeof TerminalManagerWidget;

    before(async () => {
        // the widget's modules need the DOM when they are loaded
        disableJSDOM = enableJSDOM();
        const { FrontendApplicationConfigProvider } = await import('@theia/core/lib/browser/frontend-application-config-provider');
        FrontendApplicationConfigProvider.set({});
        ({ TerminalManagerWidget: TerminalManagerWidgetClass } = await import('./terminal-manager-widget.js'));
    });

    after(() => {
        disableJSDOM();
    });

    function createWidget(profilesApplied: Promise<void>, created: unknown[]): TerminalManagerWidget {
        const widget = Object.create(TerminalManagerWidgetClass.prototype) as TerminalManagerWidget;
        Object.assign(widget, {
            stateIsSet: false,
            terminalWidgets: new Map(),
            terminalFrontendContribution: { whenProfilesApplied: () => profilesApplied },
            onDidChangeTrackableWidgetsEmitter: { fire: () => { } },
            getTrackableWidgets: () => [],
            createTerminalWidget: async () => {
                const terminal = {};
                created.push(terminal);
                return terminal;
            },
            addTerminalPage: (terminal: unknown) => {
                (widget as unknown as { terminalWidgets: Map<unknown, unknown> }).terminalWidgets.set(terminal, terminal);
            }
        });
        return widget;
    }

    it('should create one default terminal for the calls made while the profiles are not applied', async () => {
        const profilesApplied = new Deferred<void>();
        const created: unknown[] = [];
        const widget = createWidget(profilesApplied.promise, created);
        const calls = [widget.populateLayout(), widget.populateLayout()];
        profilesApplied.resolve();
        await Promise.all(calls);
        expect(created).to.have.lengthOf(1);
    });

    it('should not create a default terminal once the widget is closed', async () => {
        const profilesApplied = new Deferred<void>();
        const created: unknown[] = [];
        const widget = createWidget(profilesApplied.promise, created);
        const populated = widget.populateLayout();
        Object.defineProperty(widget, 'isDisposed', { value: true });
        profilesApplied.resolve();
        await populated;
        expect(created).to.be.empty;
    });

    it('should not wait for the profiles if the layout has a terminal', async () => {
        const created: unknown[] = [];
        const widget = createWidget(new Promise(() => { }), created);
        Object.assign(widget, { stateIsSet: true });
        await widget.populateLayout();
        expect(created).to.be.empty;
    });
});
