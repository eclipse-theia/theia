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

import { Title, Widget } from '@lumino/widgets';
import { ScrollableTabBar, TabBarRenderer } from './tab-bars';
import { isPinned, PINNED_CLASS } from '../widgets/widget';
import { Disposable } from '../../common';
import { CorePreferences } from '../../common/core-preferences';

disableJSDOM();

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
});

describe('ScrollableTabBar pinned tabs', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    const createTitle = (label: string, pinned = false): Title<Widget> => new Title<Widget>({
        owner: new Widget(),
        label,
        closable: !pinned,
        className: pinned ? PINNED_CLASS : ''
    });

    const createTabBar = (): ScrollableTabBar => {
        const tabBar = new ScrollableTabBar();
        tabBar.pinnedTabSizingMode = 'shrink';
        return tabBar;
    };

    const labels = (tabBar: ScrollableTabBar): string[] => tabBar.titles.map(title => title.label);

    it('keeps an unpinned tab from being inserted within the pinned tabs', () => {
        const tabBar = createTabBar();
        tabBar.insertTab(0, createTitle('p1', true));
        tabBar.insertTab(1, createTitle('p2', true));
        tabBar.insertTab(2, createTitle('u1'));
        // simulate dropping an unpinned tab in the middle of the pinned tabs
        tabBar.insertTab(1, createTitle('u2'));
        expect(labels(tabBar)).to.deep.equal(['p1', 'p2', 'u2', 'u1']);
    });

    it('keeps a pinned tab from being moved after unpinned tabs', () => {
        const tabBar = createTabBar();
        const p1 = createTitle('p1', true);
        tabBar.insertTab(0, p1);
        tabBar.insertTab(1, createTitle('p2', true));
        tabBar.insertTab(2, createTitle('u1'));
        // simulate dragging a pinned tab to the end of the tab bar
        tabBar.insertTab(3, p1);
        expect(labels(tabBar)).to.deep.equal(['p2', 'p1', 'u1']);
    });

    it('inserts a pinned tab within the pinned group', () => {
        const tabBar = createTabBar();
        tabBar.insertTab(0, createTitle('p1', true));
        tabBar.insertTab(1, createTitle('u1'));
        tabBar.insertTab(2, createTitle('p2', true));
        expect(labels(tabBar)).to.deep.equal(['p1', 'p2', 'u1']);
    });

    it('keeps a newly pinned tab at the end of the pinned group', () => {
        const tabBar = createTabBar();
        const u1 = createTitle('u1');
        tabBar.insertTab(0, createTitle('p1', true));
        tabBar.insertTab(1, u1);
        tabBar.insertTab(2, createTitle('u2'));
        // simulate pinning the tab right after the pinned group: the tab bar moves it
        // to the index of the first unpinned title
        u1.closable = false;
        u1.className = PINNED_CLASS;
        tabBar.insertTab(tabBar.titles.findIndex(title => !isPinned(title)), u1);
        expect(labels(tabBar)).to.deep.equal(['p1', 'u1', 'u2']);
    });

    it('moves pinned tabs to the start when shrink mode is enabled', () => {
        const tabBar = new ScrollableTabBar();
        tabBar.insertTab(0, createTitle('u1'));
        tabBar.insertTab(1, createTitle('p1', true));
        tabBar.insertTab(2, createTitle('u2'));
        tabBar.insertTab(3, createTitle('p2', true));
        expect(labels(tabBar)).to.deep.equal(['u1', 'p1', 'u2', 'p2']);
        tabBar.pinnedTabSizingMode = 'shrink';
        expect(labels(tabBar)).to.deep.equal(['p1', 'p2', 'u1', 'u2']);
    });

    it('does not reorder tabs when shrink mode is disabled', () => {
        const tabBar = new ScrollableTabBar();
        tabBar.insertTab(0, createTitle('p1', true));
        tabBar.insertTab(1, createTitle('u1'));
        tabBar.insertTab(0, createTitle('u2'));
        expect(labels(tabBar)).to.deep.equal(['u2', 'p1', 'u1']);
    });

    const createRenderedTabBar = (): ScrollableTabBar => {
        // A minimal preferences stub so that the renderer registers disposables,
        // like the injected renderer in the application does.
        const preferences = {
            onPreferenceChanged: () => Disposable.create(() => { }),
            get: () => undefined
        } as unknown as CorePreferences;
        const renderer = new TabBarRenderer(undefined, undefined, undefined, undefined, undefined, preferences);
        const tabBar = new ScrollableTabBar({ renderer });
        renderer.tabBar = tabBar;
        return tabBar;
    };

    it('assigns increasing sticky offsets to pinned tabs so that they stack instead of overlapping', () => {
        const tabBar = createRenderedTabBar();
        tabBar.insertTab(0, createTitle('p1', true));
        tabBar.insertTab(1, createTitle('p2', true));
        tabBar.insertTab(2, createTitle('p3', true));
        tabBar.insertTab(3, createTitle('u1'));
        tabBar.pinnedTabSizingMode = 'shrink';
        const tabs = Array.from(tabBar.contentNode.children) as HTMLElement[];
        expect(tabs[0].style.getPropertyValue('--theia-pinned-tab-offset')).to.equal('0px');
        expect(tabs[1].style.getPropertyValue('--theia-pinned-tab-offset')).to.equal('80px');
        expect(tabs[2].style.getPropertyValue('--theia-pinned-tab-offset')).to.equal('160px');
        expect(tabs[3].style.getPropertyValue('--theia-pinned-tab-offset')).to.equal('');
        // the sticky offset must not be an inline `left` style: lumino positions
        // the tabs with inline `left` styles while dragging
        expect(tabs[0].style.left).to.equal('');
        expect(tabs[1].style.left).to.equal('');
        expect(tabs[2].style.left).to.equal('');
    });

    it('does not assign sticky offsets when shrink mode is disabled', () => {
        const tabBar = createRenderedTabBar();
        tabBar.insertTab(0, createTitle('p1', true));
        tabBar.insertTab(1, createTitle('p2', true));
        tabBar.pinnedTabSizingMode = 'normal';
        const tabs = Array.from(tabBar.contentNode.children) as HTMLElement[];
        expect(tabs[0].style.getPropertyValue('--theia-pinned-tab-offset')).to.equal('');
        expect(tabs[1].style.getPropertyValue('--theia-pinned-tab-offset')).to.equal('');
    });

    it('suspends pinned tab transitions only for the first frame of a drag', async () => {
        // jsdom has no requestAnimationFrame unless it is polyfilled
        (window as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame ??=
            (callback: FrameRequestCallback): number => setTimeout(() => callback(performance.now()), 0) as unknown as number;
        const tabBar = createRenderedTabBar();
        tabBar.pinnedTabSizingMode = 'shrink';
        const suspend = (): void =>
            (tabBar as unknown as { suspendPinnedTabTransitionsOnDragStart(): void }).suspendPinnedTabTransitionsOnDragStart();
        suspend();
        expect(tabBar.node.classList.contains('theia-pinned-tab-drag-start')).to.be.true;
        // the class is removed again after the next frame, so that lumino's
        // transition slides the pinned tabs for the rest of the drag
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(tabBar.node.classList.contains('theia-pinned-tab-drag-start')).to.be.false;
    });

    describe('revealTab', () => {

        // jsdom has no layout and no requestAnimationFrame: mock both
        const setup = (): { tabBar: ScrollableTabBar, container: HTMLElement } => {
            (window as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame ??=
                (callback: FrameRequestCallback): number => setTimeout(() => callback(performance.now()), 0) as unknown as number;
            const tabBar = createRenderedTabBar();
            tabBar.insertTab(0, createTitle('p1', true));
            tabBar.insertTab(1, createTitle('p2', true));
            tabBar.insertTab(2, createTitle('u1'));
            tabBar.insertTab(3, createTitle('u2'));
            tabBar.pinnedTabSizingMode = 'shrink';
            // revealTab only proceeds when the tab bar is visible; avoid attaching so that
            // no scroll bar is created (perfect-scrollbar is not resolvable under Node)
            Object.defineProperty(tabBar, 'isVisible', { value: true, configurable: true });
            const container = tabBar.node.querySelector('.lm-TabBar-content-container') as HTMLElement;
            const tabs = Array.from(tabBar.contentNode.children) as HTMLElement[];
            const lefts = [0, 80, 160, 240];
            tabs.forEach((tab, i) => {
                Object.defineProperty(tab, 'offsetLeft', { value: lefts[i], configurable: true });
                Object.defineProperty(tab, 'clientWidth', { value: 80, configurable: true });
            });
            Object.defineProperty(container, 'clientWidth', { value: 400, configurable: true });
            return { tabBar, container };
        };

        it('reveals a tab scrolled off to the left to the right of the sticky pinned tabs', async () => {
            const { tabBar, container } = setup();
            container.scrollLeft = 300; // scrolled right, u1 (offsetLeft 160) off-screen left
            await tabBar.revealTab(2);
            // the pinned cluster is 2 * 80 = 160 wide, so u1 is revealed at scrollLeft 0
            expect(container.scrollLeft).to.equal(0);
        });

        it('does not scroll when revealing a sticky pinned tab', async () => {
            const { tabBar, container } = setup();
            container.scrollLeft = 300;
            await tabBar.revealTab(1); // p2: sticky pinned tabs are always visible
            expect(container.scrollLeft).to.equal(300);
        });
    });
});
