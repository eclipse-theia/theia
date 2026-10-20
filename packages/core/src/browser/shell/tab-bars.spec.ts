// *****************************************************************************
// Copyright (C) 2019 Ericsson and others.
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
import { TabBar, Title, Widget } from '@lumino/widgets';
import { BreadcrumbsRenderer } from '../breadcrumbs/breadcrumbs-renderer';
import { NativeTabDragService } from './native-tab-drag-service';
import { TabBarToolbar, TabBarToolbarRegistry } from './tab-bar-toolbar';
import { TabBarRenderer, ToolbarAwareTabBar } from './tab-bars';

disableJSDOM();

/** A toolbar without items, it does not need the services that it would get injected otherwise */
class EmptyTabBarToolbar extends TabBarToolbar {
    override updateTarget(): void { }
}

/** Breadcrumbs that are never shown, they do not need the services that they would get injected otherwise */
class EmptyBreadcrumbsRenderer extends BreadcrumbsRenderer {
    override async refresh(): Promise<void> { }
}

describe('tab bar', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    it('should disambiguate tabs that have identical names', () => {
        const tabBar = new TabBarRenderer();
        const owner = new Widget();

        const tabLabels: string[] = ['index.ts', 'index.ts', 'index.ts', 'main.ts', 'main.ts', 'main.ts', 'uniqueFile.ts'];
        const tabPaths: string[] = [
            'root1/src/foo/bar/index.ts',
            'root1/lib/foo/bar/index.ts',
            'root2/src/foo/goo/bar/index.ts',
            'root1/aaa/main.ts',
            'root1/aaa/bbb/main.ts',
            'root1/aaa/bbb/ccc/main.ts',
            'root1/src/foo/bar/uniqueFile.ts'
        ];
        const tabs: Title<Widget>[] = tabLabels.map((label, i) => new Title<Widget>({
            owner, label, caption: tabPaths[i]
        }));
        const pathMap = tabBar.findDuplicateLabels(tabs);

        expect(pathMap.get(tabPaths[0])).to.be.equal('.../src/...');
        expect(pathMap.get(tabPaths[1])).to.be.equal('.../lib/...');
        expect(pathMap.get(tabPaths[2])).to.be.equal('root2/...');
        expect(pathMap.get(tabPaths[3])).to.be.equal('root1/aaa');
        expect(pathMap.get(tabPaths[4])).to.be.equal('root1/aaa/bbb');
        expect(pathMap.get(tabPaths[5])).to.be.equal('.../ccc');
        expect(pathMap.get(tabPaths[6])).to.be.equal(undefined);
    });

    describe('native tab drag', () => {

        function addTab(tabBar: TabBar<Widget>): HTMLElement {
            tabBar.addTab(new Widget().title);
            MessageLoop.sendMessage(tabBar, Widget.Msg.UpdateRequest);
            const tab = tabBar.contentNode.children[0] as HTMLElement;
            tab.getBoundingClientRect = () => new DOMRect(0, 0, 100, 20);
            return tab;
        }

        function pressTab(tabBar: TabBar<Widget>, tab: HTMLElement): MouseEvent {
            const event = new MouseEvent('pointerdown', { button: 0, clientX: 10, clientY: 10, cancelable: true });
            Object.defineProperty(event, 'target', { value: tab });
            tabBar.handleEvent(event);
            return event;
        }

        // Native tab drags rely on skipping Lumino's `preventDefault`, see `ToolbarAwareTabBar.handleNativeTabDragEvent`.
        // If Lumino stops preventing the default action of tab presses, that override can be removed.
        it('Lumino should prevent the default action of a press on a tab', () => {
            const tabBar = new TabBar<Widget>();
            try {
                expect(pressTab(tabBar, addTab(tabBar)).defaultPrevented).to.be.true;
            } finally {
                tabBar.dispose();
            }
        });

        it('should not prevent the default action of a press on a tab when native tab drag is enabled', () => {
            const tabBar = new ToolbarAwareTabBar(new TabBarToolbarRegistry(), () => new EmptyTabBarToolbar(), () => new EmptyBreadcrumbsRenderer());
            try {
                tabBar.nativeTabDragService = {} as NativeTabDragService;
                tabBar.enableNativeTabDrag();
                expect(pressTab(tabBar, addTab(tabBar)).defaultPrevented).to.be.false;
            } finally {
                tabBar.dispose();
            }
        });
    });
});
