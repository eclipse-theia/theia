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

    // Creates a shell-like object with the minimal wiring needed to exercise tab navigation,
    // without constructing the full application shell.
    function createShellForTabNavigation(recentWidgets: Widget[], currentWidget: Widget, order: 'position' | 'recency' = 'recency'):
        { shell: ApplicationShell, tabBar: TabBar<Widget> } {
        const shell = Object.create(ApplicationShell.prototype) as unknown as ApplicationShell;
        const tabBar = new TabBar<Widget>();
        recentWidgets.forEach(w => tabBar.addTab(w.title));
        Object.assign(shell, {
            recentWidgets,
            corePreferences: { get: () => order },
            tracker: { currentWidget },
            activateWidget: sinon.stub().resolves(undefined),
            recencyNavigationActive: false,
            navigationModifierDown: true, // consecutive presses simulate Ctrl being held
            lastRecencyNavigationTarget: undefined,
        });
        sinon.stub(shell, 'getTabBarFor').returns(tabBar);
        return { shell, tabBar };
    }

    function setCurrentWidget(shell: ApplicationShell, widget: Widget): void {
        (shell as unknown as { tracker: { currentWidget: Widget } }).tracker.currentWidget = widget;
    }

    it('navigates to the next tab by most-recent order when navigationOrder is "recency"', () => {
        const a = new Widget(); a.id = 'a';
        const b = new Widget(); b.id = 'b';
        const c = new Widget(); c.id = 'c';
        // Recency: c (most recent), then a, then b.
        const { shell } = createShellForTabNavigation([c, a, b], c);
        const activateWidget = (shell as unknown as { activateWidget: sinon.SinonStub }).activateWidget;

        (shell as unknown as { activateTabByRecency: (d: 1 | -1) => boolean }).activateTabByRecency(1);
        expect(activateWidget.calledOnceWith('a')).to.be.true;

        activateWidget.resetHistory();
        setCurrentWidget(shell, a);
        (shell as unknown as { activateTabByRecency: (d: 1 | -1) => boolean }).activateTabByRecency(1);
        expect(activateWidget.calledOnceWith('b')).to.be.true;

        activateWidget.resetHistory();
        setCurrentWidget(shell, b);
        (shell as unknown as { activateTabByRecency: (d: 1 | -1) => boolean }).activateTabByRecency(1);
        expect(activateWidget.calledOnceWith('c')).to.be.true;
    });

    it('navigates to the previous tab by most-recent order when navigationOrder is "recency"', () => {
        const a = new Widget(); a.id = 'a';
        const b = new Widget(); b.id = 'b';
        const c = new Widget(); c.id = 'c';
        // Recency: c (most recent), then a, then b.
        const { shell } = createShellForTabNavigation([c, a, b], c);
        const activateWidget = (shell as unknown as { activateWidget: sinon.SinonStub }).activateWidget;

        (shell as unknown as { activateTabByRecency: (d: 1 | -1) => boolean }).activateTabByRecency(-1);
        expect(activateWidget.calledOnceWith('b')).to.be.true;

        activateWidget.resetHistory();
        setCurrentWidget(shell, b);
        (shell as unknown as { activateTabByRecency: (d: 1 | -1) => boolean }).activateTabByRecency(-1);
        expect(activateWidget.calledOnceWith('a')).to.be.true;

        activateWidget.resetHistory();
        setCurrentWidget(shell, a);
        (shell as unknown as { activateTabByRecency: (d: 1 | -1) => boolean }).activateTabByRecency(-1);
        expect(activateWidget.calledOnceWith('c')).to.be.true;
    });

    it('uses positional order when navigationOrder is "position"', () => {
        const a = new Widget(); a.id = 'a';
        const b = new Widget(); b.id = 'b';
        const { shell, tabBar } = createShellForTabNavigation([a, b], a, 'position');
        tabBar.currentIndex = 0;
        const activateWidget = (shell as unknown as { activateWidget: sinon.SinonStub }).activateWidget;

        expect(shell.activateNextTab()).to.be.true;
        expect(tabBar.currentIndex).to.equal(1);
        expect(activateWidget.calledOnceWith('b')).to.be.true;
    });

    it('falls back to positional navigation in recency mode when the current widget is not a tab of the current tab bar', () => {
        const a = new Widget(); a.id = 'a';
        const b = new Widget(); b.id = 'b';
        const outside = new Widget(); outside.id = 'outside';
        const { shell, tabBar } = createShellForTabNavigation([a, b], outside);
        tabBar.currentIndex = 0;
        const activateWidget = (shell as unknown as { activateWidget: sinon.SinonStub }).activateWidget;

        expect(shell.activateNextTab()).to.be.true;
        expect(tabBar.currentIndex).to.equal(1);
        expect(activateWidget.calledOnceWith('b')).to.be.true;
    });

    it('maintains the most-recently-activated order on activation and removal', () => {
        const shell = Object.create(ApplicationShell.prototype) as unknown as ApplicationShell;
        Object.assign(shell, { recentWidgets: [] as Widget[] });
        const internals = shell as unknown as {
            noteWidgetActivated: (widget: Widget | undefined) => void;
            noteWidgetRemoved: (widget: Widget) => void;
            recentWidgets: Widget[];
        };
        const a = new Widget(); a.id = 'a';
        const b = new Widget(); b.id = 'b';
        const ids = (): string[] => internals.recentWidgets.map(w => w.id);

        internals.noteWidgetActivated(a);
        internals.noteWidgetActivated(b);
        expect(ids()).to.deep.equal(['b', 'a']);
        internals.noteWidgetActivated(a); // re-activating moves the widget to the front
        expect(ids()).to.deep.equal(['a', 'b']);
        internals.noteWidgetActivated(undefined);
        expect(ids()).to.deep.equal(['a', 'b']);
        internals.noteWidgetRemoved(a);
        expect(ids()).to.deep.equal(['b']);
    });

    it('does not update the recency order while the navigation keys are held, and toggles back after release', () => {
        const a = new Widget(); a.id = 'a';
        const b = new Widget(); b.id = 'b';
        const c = new Widget(); c.id = 'c';
        // Recency: a (most recent), then b, then c.
        const { shell } = createShellForTabNavigation([a, b, c], a);
        const internals = shell as unknown as {
            activateTabByRecency: (d: 1 | -1) => boolean;
            noteWidgetActivated: (widget: Widget | undefined) => void;
            commitRecencyNavigation: () => void;
            recentWidgets: Widget[];
            navigationModifierDown: boolean;
        };
        const activateWidget = (shell as unknown as { activateWidget: sinon.SinonStub }).activateWidget;
        const ids = (): string[] => internals.recentWidgets.map(w => w.id);

        internals.activateTabByRecency(1); // a -> b, Ctrl held
        expect(activateWidget.calledOnceWith('b')).to.be.true;
        internals.noteWidgetActivated(b); // suppressed while the burst is active
        setCurrentWidget(shell, b);
        expect(ids()).to.deep.equal(['a', 'b', 'c']); // the recency order is unchanged
        internals.activateTabByRecency(1); // still cycling the original order, however slow: b -> c
        expect(activateWidget.calledWith('c')).to.be.true;
        setCurrentWidget(shell, c);

        internals.navigationModifierDown = false; // Ctrl released
        internals.commitRecencyNavigation(); // commits the tab the burst landed on
        expect(ids()).to.deep.equal(['c', 'a', 'b']);

        activateWidget.resetHistory();
        internals.activateTabByRecency(1); // new burst from the updated order: c -> a
        expect(activateWidget.calledOnceWith('a')).to.be.true;
    });

    it('toggles back between two tabs when navigation is pressed, released, and pressed again', () => {
        const a = new Widget(); a.id = 'a';
        const b = new Widget(); b.id = 'b';
        const c = new Widget(); c.id = 'c';
        // Recency: a (most recent), then b, then c.
        const { shell } = createShellForTabNavigation([a, b, c], a);
        const internals = shell as unknown as {
            activateTabByRecency: (d: 1 | -1) => boolean;
            navigationModifierDown: boolean;
        };
        const activateWidget = (shell as unknown as { activateWidget: sinon.SinonStub }).activateWidget;

        internals.activateTabByRecency(1); // a -> b
        expect(activateWidget.calledOnceWith('b')).to.be.true;
        setCurrentWidget(shell, b);
        internals.navigationModifierDown = false; // Ctrl released; no key-up reached the shell

        activateWidget.resetHistory();
        internals.activateTabByRecency(1); // the previous burst is committed first: back to a
        expect(activateWidget.calledOnceWith('a')).to.be.true;
    });
});
