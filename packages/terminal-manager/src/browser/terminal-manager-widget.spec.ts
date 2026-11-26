// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
// jsdom only provides requestAnimationFrame with pretendToBeVisual, which enableJSDOM does not set
(globalThis as unknown as Record<string, unknown>)['requestAnimationFrame'] ??= (callback: () => void): number => setTimeout(callback, 0) as unknown as number;
const disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
try { FrontendApplicationConfigProvider.set({}); } catch { /* already set by a sibling spec */ }

import { expect } from 'chai';
import { MessageLoop, SplitLayout, SplitPanel, Widget } from '@theia/core/lib/browser';
import { TerminalManagerWidget } from './terminal-manager-widget.js';

disableJSDOM();

describe('TerminalManagerWidget', () => {

    let disable: () => void;
    before(() => {
        disable = enableJSDOM();
    });
    after(() => {
        disable();
    });

    interface TestWidgetAccess {
        createPageAndTreeLayout(): Promise<void>;
        panel: SplitPanel;
        pageAndTreeLayout: SplitLayout;
        treeWidget: Widget;
        terminalPanelWrapper: Widget;
    }

    function createWidget(): TerminalManagerWidget {
        const widget = new TerminalManagerWidget();
        const access = widget as unknown as TestWidgetAccess & {
            terminalManagerPreferences: { ready: Promise<void>; get: (name: string) => unknown };
        };
        access.treeWidget = new Widget();
        access.terminalManagerPreferences = {
            ready: Promise.resolve(),
            get: (name: string) => name === 'terminal.grouping.treeViewLocation' ? 'left' : undefined,
        };
        return widget;
    }

    it('keeps the tree width when the panel is resized, e.g. when a side panel is moved', async () => {
        const widget = createWidget();
        const access = widget as unknown as TestWidgetAccess;
        await access.createPageAndTreeLayout();

        // the tree side must not stretch, the terminal side absorbs size changes
        expect(SplitPanel.getStretch(access.treeWidget)).to.equal(0);
        expect(SplitPanel.getStretch(access.terminalPanelWrapper)).to.equal(1);

        Widget.attach(widget, document.body);
        let width = 0;
        Object.defineProperty(access.panel.node, 'offsetWidth', { configurable: true, get: () => width });
        Object.defineProperty(access.panel.node, 'offsetHeight', { configurable: true, get: () => 400 });
        const relayout = (newWidth: number): void => {
            width = newWidth;
            MessageLoop.sendMessage(access.panel, Widget.Msg.FitRequest);
            MessageLoop.sendMessage(access.panel, Widget.Msg.UpdateRequest);
        };

        relayout(1200);
        access.pageAndTreeLayout.setRelativeSizes([0.2, 0.6]);
        relayout(1200);
        const treeWidthBefore = access.pageAndTreeLayout.absoluteSizes()[0];
        expect(treeWidthBefore).to.be.greaterThan(0);

        // a side panel is widened, so the bottom panel becomes narrower
        relayout(600);
        const treeWidthAfter = access.pageAndTreeLayout.absoluteSizes()[0];
        expect(treeWidthAfter).to.be.closeTo(treeWidthBefore, 1);

        widget.dispose();
    });
});
