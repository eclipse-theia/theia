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

import { Drag } from '@lumino/dragdrop';
import { TabBar, Widget } from '@lumino/widgets';
import { WIDGET_FACTORY_MIME_TYPE } from './native-tab-drag-service';

/**
 * Supports drop targets that insert a dragged widget as a tab of a tab bar where it is dropped:
 * finds the dragged widget and the insertion index, and marks the tab before or after which the widget is inserted.
 */
export class TabDropHelper {

    protected insertionMarker?: { tab: Element, className: string };

    /**
     * @param markerClassNames the classes marking the tab before (`before`) or after (`after`) which a dropped widget is inserted
     */
    constructor(protected readonly markerClassNames: { before: string, after: string }) { }

    getDraggedWidget(event: Drag.Event): Widget | undefined {
        const factory = event.mimeData.getData(WIDGET_FACTORY_MIME_TYPE);
        const widget = typeof factory === 'function' ? factory() : undefined;
        return widget instanceof Widget ? widget : undefined;
    }

    /**
     * @returns the index of the tab before which a widget dropped at the given position is inserted,
     * or the number of tabs if it is appended
     */
    findInsertionIndex(tabBar: TabBar<Widget>, clientX: number, clientY: number): number {
        const horizontal = tabBar.orientation === 'horizontal';
        const tabs = tabBar.contentNode.children;
        for (let i = 0; i < tabs.length; i++) {
            const rect = tabs[i].getBoundingClientRect();
            const start = horizontal ? rect.left : rect.top;
            const size = horizontal ? rect.width : rect.height;
            if (size > 0 && (horizontal ? clientX : clientY) < start + size / 2) {
                return i;
            }
        }
        return tabs.length;
    }

    showInsertionMarker(tabBar: TabBar<Widget>, index: number): void {
        const tabs = tabBar.contentNode.children;
        const tab = index < tabs.length ? tabs[index] : tabs[tabs.length - 1];
        const className = index < tabs.length ? this.markerClassNames.before : this.markerClassNames.after;
        if (this.insertionMarker?.tab === tab && this.insertionMarker.className === className) {
            return;
        }
        this.hideInsertionMarker();
        if (tab) {
            tab.classList.add(className);
            this.insertionMarker = { tab, className };
        }
    }

    hideInsertionMarker(): void {
        if (this.insertionMarker) {
            this.insertionMarker.tab.classList.remove(this.insertionMarker.className);
            this.insertionMarker = undefined;
        }
    }

}
