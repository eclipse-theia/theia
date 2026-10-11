// *****************************************************************************
// Copyright (C) 2026 JuliaHub, Inc. and others.
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

import { enableJSDOM } from '../test/jsdom';
let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { MessageLoop } from '@lumino/messaging';
import { DockPanel, TabBar, Widget } from '@lumino/widgets';
import { TabBarTracker } from './tab-bar-tracker';

disableJSDOM();

describe('TabBarTracker', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    let panel: DockPanel | undefined;

    afterEach(() => {
        if (panel) {
            Widget.detach(panel);
            panel.dispose();
            panel = undefined;
        }
    });

    function attachInDockPanel(): Widget {
        panel = new DockPanel();
        Widget.attach(panel, document.body);
        const widget = new Widget();
        panel.addWidget(widget);
        MessageLoop.flush();
        return widget;
    }

    it('reports the enclosing tab-bar on the first check', () => {
        const widget = attachInDockPanel();
        const events: Array<[TabBar<Widget> | undefined, TabBar<Widget> | undefined]> = [];
        const tracker = new TabBarTracker(widget, (oldTabBar, newTabBar) => events.push([oldTabBar, newTabBar]));
        tracker.check();
        expect(events).lengthOf(1);
        expect(events[0][0]).undefined;
        expect(events[0][1]).not.undefined;
    });

    it('does not report again when the tab-bar has not changed', () => {
        const widget = attachInDockPanel();
        let count = 0;
        const tracker = new TabBarTracker(widget, () => count++);
        tracker.check();
        tracker.check();
        expect(count).equal(1);
    });

    it('does nothing when the widget is not inside a DockPanel', () => {
        let count = 0;
        const tracker = new TabBarTracker(new Widget(), () => count++);
        tracker.check();
        expect(count).equal(0);
    });

    it('stops reporting once disposed', () => {
        const widget = attachInDockPanel();
        let count = 0;
        const tracker = new TabBarTracker(widget, () => count++);
        tracker.dispose();
        tracker.check();
        expect(count).equal(0);
    });

    it('reports a move between two tab-bars', () => {
        panel = new DockPanel();
        Widget.attach(panel, document.body);
        const other = new Widget();
        const widget = new Widget();
        panel.addWidget(other);
        panel.addWidget(widget, { mode: 'split-right', ref: other });
        MessageLoop.flush();
        const events: Array<[TabBar<Widget> | undefined, TabBar<Widget> | undefined]> = [];
        const tracker = new TabBarTracker(widget, (oldTabBar, newTabBar) => events.push([oldTabBar, newTabBar]));
        tracker.check();
        panel.addWidget(widget, { mode: 'tab-after', ref: other });
        MessageLoop.flush();
        tracker.check();
        expect(events).lengthOf(2);
        expect(events[1][0]).not.undefined;
        expect(events[1][0]).not.equal(events[1][1]);
    });

    it('re-reports the current tab-bar after reset', () => {
        const widget = attachInDockPanel();
        const events: Array<[TabBar<Widget> | undefined, TabBar<Widget> | undefined]> = [];
        const tracker = new TabBarTracker(widget, (oldTabBar, newTabBar) => events.push([oldTabBar, newTabBar]));
        tracker.check();
        tracker.reset();
        tracker.check();
        expect(events).lengthOf(2);
        expect(events[1][0]).undefined;
        expect(events[1][1]).not.undefined;
    });
});
