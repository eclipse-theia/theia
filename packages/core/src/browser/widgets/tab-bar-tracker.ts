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

import { find } from '@lumino/algorithm';
import { DockPanel, TabBar, Widget } from '@lumino/widgets';
import { Disposable, DisposableCollection } from '../../common';

/**
 * Detects when a widget is moved between the tab-bars of its enclosing {@link DockPanel} and
 * notifies a callback with the previous and current tab-bar. Call {@link check} from the host
 * widget's `onAfterAttach`.
 */
export class TabBarTracker implements Disposable {

    protected currentTabBar: TabBar<Widget> | undefined;
    protected isDisposed = false;
    protected readonly toDisposeOnTabBarChange = new DisposableCollection();

    constructor(
        protected readonly widget: Widget,
        protected readonly onTabBarChange: (oldTabBar?: TabBar<Widget>, newTabBar?: TabBar<Widget>) => void
    ) { }

    check(): void {
        if (this.isDisposed) {
            return;
        }
        const parent = this.widget.parent;
        if (parent instanceof DockPanel) {
            const newTabBar = find(parent.tabBars(), tabBar => !!tabBar.titles.find(title => title === this.widget.title));
            if (this.currentTabBar !== newTabBar) {
                this.toDisposeOnTabBarChange.dispose();
                const listener = () => this.check();
                parent.layoutModified.connect(listener);
                this.toDisposeOnTabBarChange.push(Disposable.create(() => parent.layoutModified.disconnect(listener)));
                const last = this.currentTabBar;
                this.currentTabBar = newTabBar;
                this.onTabBarChange(last, newTabBar);
            }
        }
    }

    /**
     * Forgets the current tab-bar so that the next {@link check} reports it again as
     * `(undefined, currentTabBar)`. Listeners on the enclosing panel stay connected.
     */
    reset(): void {
        this.currentTabBar = undefined;
    }

    dispose(): void {
        this.isDisposed = true;
        this.toDisposeOnTabBarChange.dispose();
    }
}
