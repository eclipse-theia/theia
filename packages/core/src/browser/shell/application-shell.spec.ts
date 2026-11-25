// *****************************************************************************
// Copyright (C) 2026 Alec Timison.
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

import { enableJSDOM } from '../test/jsdom.js';
const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { TabBar, Widget } from '../../../shared/@lumino/widgets/index.cjs';
import * as sinon from 'sinon';
import { DisposableCollection } from '../../common/disposable.js';
import { ApplicationShell } from './application-shell.js';
disableJSDOM();

describe('ApplicationShell', () => {
    let toTearDown: () => void;

    beforeEach(() => {
        toTearDown = enableJSDOM();
    });

    afterEach(() => {
        sinon.restore();
        toTearDown();
    });

    it('cancels the previous activation check', () => {
        const shell = Object.create(ApplicationShell.prototype) as ApplicationShell;
        Object.assign(shell, {
            toDisposeOnActivationCheck: new DisposableCollection(),
            logger: { warn: sinon.stub() }
        });
        const assertActivated = (shell as unknown as { assertActivated(widget: Widget): void }).assertActivated.bind(shell);
        const firstWidget = new Widget();
        const secondWidget = new Widget();
        const request = {} as ReturnType<typeof window.setTimeout>;
        sinon.stub(globalThis, 'setTimeout').returns(request);
        sinon.stub(window, 'setTimeout').returns(request);
        const clearTimeout = sinon.stub(window, 'clearTimeout');
        window.cancelAnimationFrame = sinon.stub();

        assertActivated(firstWidget);
        assertActivated(secondWidget);

        expect(clearTimeout.callCount).to.equal(1);
        expect(clearTimeout.firstCall.args[0]).to.equal(request);
        firstWidget.dispose();
        secondWidget.dispose();
    });

    describe('main area sections', () => {
        const sections: ApplicationShell.MainAreaSection[] = [
            { id: 'chat', factories: ['chat'] },
            { id: 'editors', default: true },
            { id: 'preview', matches: widget => widget.id.startsWith('preview') }
        ];
        let factoryIds: Map<Widget, string>;
        let focusNumbers: Map<Widget, number>;
        let tabBars: TabBar<Widget>[];
        let mainPanel: { tabBars: () => TabBar<Widget>[], currentTabBar: TabBar<Widget> | undefined };
        let shell: ApplicationShell;

        const createWidget = (id: string, factoryId?: string): Widget => {
            const widget = new Widget();
            widget.id = id;
            if (factoryId) {
                factoryIds.set(widget, factoryId);
            }
            return widget;
        };

        const addStack = (...widgets: Widget[]): TabBar<Widget> => {
            const tabBar = new TabBar<Widget>();
            widgets.forEach(widget => tabBar.addTab(widget.title));
            tabBars.push(tabBar);
            return tabBar;
        };

        beforeEach(() => {
            factoryIds = new Map();
            focusNumbers = new Map();
            tabBars = [];
            mainPanel = { tabBars: () => tabBars, currentTabBar: undefined };
            shell = Object.create(ApplicationShell.prototype) as ApplicationShell;
            Object.assign(shell, {
                mainPanel,
                widgetManager: { getDescription: (widget: Widget) => factoryIds.has(widget) ? { factoryId: factoryIds.get(widget) } : undefined },
                tracker: { focusNumber: (widget: Widget) => focusNumbers.get(widget) ?? -1 },
                getAreaFor: () => 'main'
            });
            shell.setMainAreaSections(sections);
        });

        it('adds a widget to the current stack if it belongs to the same section', () => {
            const editor = createWidget('editor');
            mainPanel.currentTabBar = addStack(editor);

            const { addOptions } = shell.getInsertionOptions({ area: 'main' }, createWidget('other-editor'));

            expect(addOptions.ref).to.equal(editor);
            expect(addOptions.mode).to.be.undefined;
        });

        it('adds a widget to a stack of its section if the current stack belongs to another section', () => {
            const editor = createWidget('editor');
            mainPanel.currentTabBar = addStack(createWidget('chat', 'chat'));
            addStack(editor);

            const { addOptions } = shell.getInsertionOptions({ area: 'main' }, createWidget('other-editor'));

            expect(addOptions.ref).to.equal(editor);
            expect(addOptions.mode).to.be.undefined;
        });

        it('adds a widget to the most recently focused stack of its section if the current stack belongs to another section', () => {
            const firstEditor = createWidget('first-editor');
            const secondEditor = createWidget('second-editor');
            mainPanel.currentTabBar = addStack(createWidget('chat', 'chat'));
            addStack(firstEditor);
            addStack(secondEditor);
            focusNumbers.set(firstEditor, 1);
            focusNumbers.set(secondEditor, 2);

            const { addOptions } = shell.getInsertionOptions({ area: 'main' }, createWidget('other-editor'));

            expect(addOptions.ref).to.equal(secondEditor);
        });

        it('splits right of the closest section on the left if the section has no stack yet', () => {
            const editor = createWidget('editor');
            addStack(createWidget('chat', 'chat'));
            mainPanel.currentTabBar = addStack(editor);

            const { addOptions } = shell.getInsertionOptions({ area: 'main' }, createWidget('preview'));

            expect(addOptions.ref).to.equal(editor);
            expect(addOptions.mode).to.equal('split-right');
        });

        it('splits left of the closest section on the right if there is no section on the left', () => {
            const editor = createWidget('editor');
            addStack(createWidget('preview'));
            mainPanel.currentTabBar = addStack(editor);

            const { addOptions } = shell.getInsertionOptions({ area: 'main' }, createWidget('chat', 'chat'));

            expect(addOptions.ref).to.equal(editor);
            expect(addOptions.mode).to.equal('split-left');
        });

        it('uses the default section for widgets that are not known yet', () => {
            const chat = createWidget('chat', 'chat');
            mainPanel.currentTabBar = addStack(chat);

            const { addOptions } = shell.getInsertionOptions({ area: 'main' });

            expect(addOptions.ref).to.equal(chat);
            expect(addOptions.mode).to.equal('split-right');
        });

        it('adds a widget without a reference if the main area is empty', () => {
            const { addOptions } = shell.getInsertionOptions({ area: 'main' }, createWidget('editor'));

            expect(addOptions.ref).to.be.undefined;
            expect(addOptions.mode).to.be.undefined;
        });

        it('keeps an explicit reference', () => {
            const chat = createWidget('chat', 'chat');
            mainPanel.currentTabBar = addStack(chat);

            const { addOptions } = shell.getInsertionOptions({ area: 'main', ref: chat }, createWidget('editor'));

            expect(addOptions.ref).to.equal(chat);
            expect(addOptions.mode).to.be.undefined;
        });

        it('adds a widget to the current stack if there are no sections', () => {
            const chat = createWidget('chat', 'chat');
            mainPanel.currentTabBar = addStack(chat);
            shell.setMainAreaSections(undefined);

            const { addOptions } = shell.getInsertionOptions({ area: 'main' }, createWidget('editor'));

            expect(addOptions.ref).to.equal(chat);
            expect(addOptions.mode).to.be.undefined;
        });
    });
});
