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

import { enableJSDOM } from '../test/jsdom.js';
let disableJSDOM = enableJSDOM();
import { expect } from 'chai';
import * as sinon from 'sinon';

import { MessageLoop } from '@lumino/messaging';
import { Signal } from '@lumino/signaling';
import { VirtualDOM } from '@lumino/virtualdom';
import { TabBar, Title, Widget } from '@lumino/widgets';
import { BreadcrumbsRenderer } from '../breadcrumbs/breadcrumbs-renderer.js';
import { NativeTabDragService } from './native-tab-drag-service.js';
import { TabBarToolbar, TabBarToolbarRegistry } from './tab-bar-toolbar/index.js';
import { ScrollableTabBar, SideTabBar, TabBarRenderer, ToolbarAwareTabBar } from './tab-bars.js';
import { isPinned, pin, PINNED_CLASS } from '../widgets/widget.js';
import { Disposable } from '../../common/index.js';
import { CorePreferences } from '../../common/core-preferences.js';

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

    it('should only render a close icon for closable or pinned tabs', () => {
        class TestTabBarRenderer extends TabBarRenderer {
            constructor() {
                super();
                this._tabBar = new TabBar<Widget>({ renderer: this });
            }
        }
        const renderer = new TestTabBarRenderer();
        const [closable, notClosable, pinned] = ['closable', 'notClosable', 'pinned'].map(label => new Title<Widget>({ owner: new Widget(), label }));
        closable.closable = true;
        notClosable.closable = false;
        pin(pinned);

        const closeIconTitles = [closable, notClosable, pinned].map(title => {
            const tab = VirtualDOM.realize(renderer.renderTab({ title, current: false, zIndex: 0 }));
            return tab.querySelector('.lm-TabBar-tabCloseIcon')?.getAttribute('title');
        });
        expect(closeIconTitles).to.deep.equal(['Close', undefined, 'Unpin']);
    });

    describe('side tab bar', () => {

        class TestSideTabBar extends SideTabBar {
            render(): void {
                this.renderTabs(this.contentNode);
            }
            renderedClasses(): string[] {
                return Array.from(this.contentNode.children, tab => tab.className);
            }
            overflowFrom(startIndex: number): void {
                this.hideOverflowingTabs = () => startIndex;
                this.computeOverflowingTabsData();
            }
            firstOverflowingIndex(): number {
                return this.hideOverflowingTabs();
            }
            setOverflowData(): void {
                this.tabsOverflowData = { titles: [], startIndex: 0 };
            }
        }

        function createSideTabBar(hiddenIds: string[]): { bar: TestSideTabBar, titles: Title<Widget>[] } {
            const renderer = new TabBarRenderer();
            const bar = new TestSideTabBar({ orientation: 'vertical', renderer });
            const titles = ['explorer', 'debug', 'search'].map(id => {
                const owner = new Widget();
                owner.id = id;
                owner.title.label = id;
                return bar.addTab(owner.title);
            });
            bar.shouldHideTitle = title => hiddenIds.includes(title.owner.id);
            return { bar, titles };
        }

        it('keeps a hidden tab in the DOM at its title index, hidden unless it is current', () => {
            const { bar, titles } = createSideTabBar(['debug']);

            bar.currentTitle = titles[0];
            bar.render();
            expect(bar.renderedClasses().map(c => c.includes('lm-mod-hidden'))).to.deep.equal([false, true, false]);

            bar.currentTitle = titles[1];
            bar.render();
            expect(bar.renderedClasses().map(c => c.includes('lm-mod-hidden'))).to.deep.equal([false, false, false]);
            expect(bar.isHiddenTab(titles[1])).to.be.false;
        });

        it('refuses to hide the last title that is not hidden', () => {
            const { bar, titles } = createSideTabBar(['debug', 'search']);
            expect(bar.canHideTitle(titles[0])).to.be.false;
            expect(bar.canHideTitle(titles[1])).to.be.false;
            bar.shouldHideTitle = title => title.owner.id === 'debug';
            expect(bar.canHideTitle(titles[0])).to.be.true;
        });

        it('leaves hidden tabs out of the overflow menu', () => {
            const { bar, titles } = createSideTabBar(['debug']);
            bar.currentTitle = titles[0];
            const overflowing: string[][] = [];
            bar.tabsOverflowChanged.connect((_, { titles: overflow }) => overflowing.push(overflow.map(title => title.owner.id)));
            const requestAnimationFrame = window.requestAnimationFrame;
            window.requestAnimationFrame = callback => {
                callback(0);
                return 0;
            };
            try {
                bar.overflowFrom(1);
            } finally {
                window.requestAnimationFrame = requestAnimationFrame;
            }
            expect(overflowing).to.deep.equal([['search']]);
        });

        it('keeps the last shown tab when it fits beside the overflow menu, even with hidden tabs after it', () => {
            const { bar, titles } = createSideTabBar(['search']);
            bar.currentTitle = titles[0];
            bar.render();
            const parent = document.createElement('div');
            const overflowMenu = document.createElement('div');
            overflowMenu.className = 'theia-additional-views-menu';
            Object.defineProperty(overflowMenu, 'offsetHeight', { value: 20 });
            parent.append(bar.node, overflowMenu);
            Object.defineProperty(bar.node, 'clientHeight', { value: 70 });
            // explorer and debug stack 40px each; search is hidden, so it measures 0 like a `display: none` tab.
            const tabs = Array.from(bar.contentNode.children);
            [[0, 40], [40, 40], [0, 0]].forEach(([offsetTop, offsetHeight], i) => {
                Object.defineProperty(tabs[i], 'offsetTop', { value: offsetTop });
                Object.defineProperty(tabs[i], 'offsetHeight', { value: offsetHeight });
            });
            bar.setOverflowData();

            expect(bar.firstOverflowingIndex()).to.equal(-1);
        });
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

    it('stacks sticky pinned tabs above the current unpinned tab', () => {
        const tabBar = createRenderedTabBar();
        tabBar.insertTab(0, createTitle('p1', true));
        tabBar.insertTab(1, createTitle('p2', true));
        tabBar.insertTab(2, createTitle('u1'));
        const u2 = createTitle('u2');
        tabBar.insertTab(3, u2);
        tabBar.pinnedTabSizingMode = 'shrink';
        tabBar.currentTitle = u2;
        MessageLoop.sendMessage(tabBar, Widget.Msg.UpdateRequest);
        const tabs = Array.from(tabBar.contentNode.children) as HTMLElement[];
        const zIndex = (index: number): number => Number(tabs[index].style.zIndex);
        const n = tabBar.titles.length;
        // the current tab keeps the highest z-index among the unpinned tabs ...
        expect(zIndex(3)).to.equal(n);
        // ... but the sticky pinned tabs stack above it, so that the current tab
        // scrolled underneath them is painted below them
        expect(zIndex(0)).to.be.greaterThan(n);
        expect(zIndex(1)).to.be.greaterThan(n);
    });

    it('keeps the current tab above the pinned tabs when shrink mode is disabled', () => {
        const tabBar = createRenderedTabBar();
        tabBar.insertTab(0, createTitle('p1', true));
        tabBar.insertTab(1, createTitle('u1'));
        const u2 = createTitle('u2');
        tabBar.insertTab(2, u2);
        tabBar.pinnedTabSizingMode = 'normal';
        tabBar.currentTitle = u2;
        MessageLoop.sendMessage(tabBar, Widget.Msg.UpdateRequest);
        const tabs = Array.from(tabBar.contentNode.children) as HTMLElement[];
        const zIndex = (index: number): number => Number(tabs[index].style.zIndex);
        const n = tabBar.titles.length;
        expect(zIndex(2)).to.equal(n);
        expect(zIndex(0)).to.be.lessThan(n);
    });

    // simulate a drag like lumino's pointer drag does: move the title directly, then emit `tabMoved`
    const simulateDrag = (tabBar: ScrollableTabBar, title: Title<Widget>, fromIndex: number, toIndex: number): void => {
        const titles = (tabBar as unknown as { _titles: Title<Widget>[] })._titles;
        titles.splice(toIndex, 0, titles.splice(fromIndex, 1)[0]);
        (tabBar.tabMoved as Signal<ScrollableTabBar, TabBar.ITabMovedArgs<Widget>>).emit({ fromIndex, toIndex, title });
    };

    // simulate a native drag like the dock panel does: `insertTab` (clamped to the group
    // edge in shrink mode), then emit `tabMoved` with the index the tab was dropped at
    const simulateNativeDrag = (tabBar: ScrollableTabBar, title: Title<Widget>, fromIndex: number, toIndex: number): void => {
        tabBar.insertTab(toIndex, title);
        (tabBar.tabMoved as Signal<ScrollableTabBar, TabBar.ITabMovedArgs<Widget>>).emit({ fromIndex, toIndex, title });
    };

    it('pins an unpinned tab dropped in front of the pinned tabs in shrink mode', () => {
        const tabBar = createRenderedTabBar();
        tabBar.insertTab(0, createTitle('p1', true));
        tabBar.insertTab(1, createTitle('p2', true));
        const u1 = createTitle('u1');
        tabBar.insertTab(2, u1);
        tabBar.pinnedTabSizingMode = 'shrink';
        simulateDrag(tabBar, u1, 2, 0);
        expect(isPinned(u1)).to.be.true;
        expect(u1.closable).to.be.false;
        expect(labels(tabBar)).to.deep.equal(['u1', 'p1', 'p2']);
    });

    it('pins an unpinned tab at the drop position within the pinned group', () => {
        const tabBar = createRenderedTabBar();
        tabBar.insertTab(0, createTitle('p1', true));
        tabBar.insertTab(1, createTitle('p2', true));
        tabBar.insertTab(2, createTitle('p3', true));
        const u1 = createTitle('u1');
        tabBar.insertTab(3, u1);
        tabBar.pinnedTabSizingMode = 'shrink';
        simulateNativeDrag(tabBar, u1, 3, 1); // dropped between p1 and p2
        expect(isPinned(u1)).to.be.true;
        expect(labels(tabBar)).to.deep.equal(['p1', 'u1', 'p2', 'p3']);
    });

    it('does not pin an unpinned tab dropped behind the pinned tabs in shrink mode', () => {
        const tabBar = createRenderedTabBar();
        tabBar.insertTab(0, createTitle('p1', true));
        tabBar.insertTab(1, createTitle('p2', true));
        tabBar.insertTab(2, createTitle('u1'));
        const u2 = createTitle('u2');
        tabBar.insertTab(3, u2);
        tabBar.pinnedTabSizingMode = 'shrink';
        simulateDrag(tabBar, u2, 3, 2); // right behind the pinned group
        expect(isPinned(u2)).to.be.false;
    });

    it('pins an unpinned tab dropped in front of pinned tabs when shrink mode is disabled', () => {
        const tabBar = createRenderedTabBar();
        tabBar.insertTab(0, createTitle('p1', true));
        const u1 = createTitle('u1');
        tabBar.insertTab(1, u1);
        tabBar.pinnedTabSizingMode = 'normal';
        simulateDrag(tabBar, u1, 1, 0);
        expect(isPinned(u1)).to.be.true;
        expect(labels(tabBar)).to.deep.equal(['u1', 'p1']);
    });

    it('unpins a pinned tab dragged out of the pinned group in shrink mode', () => {
        const tabBar = createRenderedTabBar();
        const p1 = createTitle('p1', true);
        tabBar.insertTab(0, p1);
        tabBar.insertTab(1, createTitle('p2', true));
        tabBar.insertTab(2, createTitle('u1'));
        tabBar.pinnedTabSizingMode = 'shrink';
        simulateDrag(tabBar, p1, 0, 2); // behind u1, outside the pinned group
        expect(isPinned(p1)).to.be.false;
        expect(p1.closable).to.be.true;
        expect(labels(tabBar)).to.deep.equal(['p2', 'u1', 'p1']);
    });

    it('unpins a pinned tab at the drop position in the unpinned group', () => {
        const tabBar = createRenderedTabBar();
        const p1 = createTitle('p1', true);
        tabBar.insertTab(0, p1);
        tabBar.insertTab(1, createTitle('p2', true));
        tabBar.insertTab(2, createTitle('u1'));
        tabBar.insertTab(3, createTitle('u2'));
        tabBar.pinnedTabSizingMode = 'shrink';
        simulateNativeDrag(tabBar, p1, 0, 3); // dropped between u1 and u2
        expect(isPinned(p1)).to.be.false;
        expect(labels(tabBar)).to.deep.equal(['p2', 'u1', 'u2', 'p1']);
    });

    it('keeps a pinned tab pinned when it is dragged within the pinned group', () => {
        const tabBar = createRenderedTabBar();
        tabBar.insertTab(0, createTitle('p1', true));
        const p2 = createTitle('p2', true);
        tabBar.insertTab(1, p2);
        tabBar.insertTab(2, createTitle('u1'));
        tabBar.pinnedTabSizingMode = 'shrink';
        simulateDrag(tabBar, p2, 1, 0);
        expect(isPinned(p2)).to.be.true;
    });

    it('unpins a pinned tab dragged out of the pinned group when shrink mode is disabled', () => {
        const tabBar = createRenderedTabBar();
        const p1 = createTitle('p1', true);
        tabBar.insertTab(0, p1);
        tabBar.insertTab(1, createTitle('u1'));
        tabBar.pinnedTabSizingMode = 'normal';
        simulateDrag(tabBar, p1, 0, 1);
        expect(isPinned(p1)).to.be.false;
        expect(labels(tabBar)).to.deep.equal(['u1', 'p1']);
    });

    it('suspends pinned tab transitions only for the first frame of a drag', async () => {
        // use sinon's fake timers so the test does not depend on the real timer resolution:
        const clock = sinon.useFakeTimers();
        try {
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
            // transition slides the pinned tabs for the rest of the drag; tick far enough
            // to run both nested frames regardless of how many there are
            await clock.tickAsync(100);
            expect(tabBar.node.classList.contains('theia-pinned-tab-drag-start')).to.be.false;
        } finally {
            clock.restore();
        }
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

    describe('updateTabs() dynamic tab sizing', () => {

        // jsdom has no layout: mock the widths that updateTabs() reads
        const setup = (pinned: number, unpinned: number, clientWidth: number,
            tabOptions: ScrollableTabBar.Options = { minimumTabSize: 40, defaultTabSize: 200, pinnedTabSize: 80 },
            openTabsWidth = 0): ScrollableTabBar => {
            const tabBar = createRenderedTabBar();
            for (let i = 0; i < pinned; i++) {
                tabBar.insertTab(i, createTitle(`p${i}`, true));
            }
            for (let i = 0; i < unpinned; i++) {
                tabBar.insertTab(pinned + i, createTitle(`u${i}`));
            }
            Object.defineProperty(tabBar.contentNode, 'clientWidth', { value: clientWidth, configurable: true });
            const tabsButton = (tabBar as unknown as { openTabsContainer: HTMLDivElement }).openTabsContainer;
            Object.defineProperty(tabsButton, 'getBoundingClientRect', { value: () => ({ width: openTabsWidth }), configurable: true });
            // the setter triggers a synchronous updateTabs()
            tabBar.dynamicTabOptions = tabOptions;
            return tabBar;
        };

        const sizes = (tabBar: ScrollableTabBar): { tabSize: number, pinnedTabWidth: number } =>
            tabBar as unknown as { tabSize: number, pinnedTabWidth: number };

        const openTabsContainer = (tabBar: ScrollableTabBar): HTMLDivElement =>
            (tabBar as unknown as { openTabsContainer: HTMLDivElement }).openTabsContainer;

        it('splits the width remaining after the pinned tabs between the unpinned tabs', () => {
            const tabBar = setup(2, 4, 600);
            // the 2 pinned tabs take 160px, the remaining 440px are split between the 4 unpinned tabs
            expect(sizes(tabBar).pinnedTabWidth).to.equal(80);
            expect(sizes(tabBar).tabSize).to.equal(110);
            const tabs = Array.from(tabBar.contentNode.children) as HTMLElement[];
            expect(tabs[0].style.minWidth).to.equal('80px');
            expect(tabs[1].style.minWidth).to.equal('80px');
            expect(tabs[2].style.minWidth).to.equal('110px');
            expect(tabs[5].style.minWidth).to.equal('110px');
        });

        it('clamps the unpinned tab size to the default tab size when there is enough room', () => {
            const tabBar = setup(1, 1, 1000);
            expect(sizes(tabBar).pinnedTabWidth).to.equal(80);
            expect(sizes(tabBar).tabSize).to.equal(200);
        });

        it('clamps the unpinned tab size to the minimum tab size when space is tight', () => {
            const tabBar = setup(2, 4, 300);
            // 2 * 80 + 4 * 40 = 320 > 300, so the open tabs button stays visible and the
            // 140px remaining after the pinned tabs cannot fit 4 tabs at a larger size
            expect(openTabsContainer(tabBar).classList.contains('lm-mod-hidden')).to.be.false;
            expect(sizes(tabBar).pinnedTabWidth).to.equal(80);
            expect(sizes(tabBar).tabSize).to.equal(40);
        });

        it('uses the default tab size when all tabs are pinned', () => {
            const tabBar = setup(3, 0, 500);
            expect(sizes(tabBar).pinnedTabWidth).to.equal(80);
            expect(sizes(tabBar).tabSize).to.equal(200);
        });

        it('shares the full width between all tabs when none are pinned', () => {
            const tabBar = setup(0, 4, 600);
            expect(sizes(tabBar).pinnedTabWidth).to.equal(0);
            expect(sizes(tabBar).tabSize).to.equal(150);
        });

        it('ignores pinned tabs when no pinned tab size is configured', () => {
            const tabBar = setup(2, 2, 600, { minimumTabSize: 40, defaultTabSize: 200 });
            expect(sizes(tabBar).pinnedTabWidth).to.equal(0);
            expect(sizes(tabBar).tabSize).to.equal(150);
        });

        it('reclaims the open tabs button width when the tabs fit without it', () => {
            const tabBar = setup(1, 2, 200, { minimumTabSize: 40, defaultTabSize: 200, pinnedTabSize: 80 }, 100);
            // the open tabs button (100px) is hidden and its width reclaimed:
            // 200 + 100 - 80 = 220px are split between the 2 unpinned tabs
            expect(openTabsContainer(tabBar).classList.contains('lm-mod-hidden')).to.be.true;
            expect(sizes(tabBar).pinnedTabWidth).to.equal(80);
            expect(sizes(tabBar).tabSize).to.equal(110);
        });
    });
});
