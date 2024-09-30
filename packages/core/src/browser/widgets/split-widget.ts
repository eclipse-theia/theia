// *****************************************************************************
// Copyright (C) 2024 1C-Soft LLC and others.
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

import { ApplicationShell, StatefulWidget } from '../shell';
import { BaseWidget, Message, PanelLayout, SplitPanel, Widget } from './widget';
import { CompositeSaveable, Saveable, SaveableSource } from '../saveable';
import { Navigatable } from '../navigatable-types';
import { Emitter, URI } from '../../common';

/**
 * A widget containing a number of panes in a split layout.
 */
export class SplitWidget extends BaseWidget implements ApplicationShell.TrackableWidgetProvider, SaveableSource, Navigatable, StatefulWidget {

    protected readonly splitPanel: SplitPanel;

    protected readonly onDidChangeTrackableWidgetsEmitter = new Emitter<Widget[]>();
    readonly onDidChangeTrackableWidgets = this.onDidChangeTrackableWidgetsEmitter.event;

    protected readonly compositeSaveable = new CompositeSaveable();

    protected navigatable?: Navigatable;

    constructor(options?: SplitPanel.IOptions & { navigatable?: Navigatable }) {
        super();

        this.toDispose.pushAll([this.onDidChangeTrackableWidgetsEmitter]);

        this.addClass('theia-split-widget');

        const layout = new PanelLayout();
        this.layout = layout;
        const that = this;
        this.splitPanel = new class extends SplitPanel {

            protected override onChildAdded(msg: Widget.ChildMessage): void {
                super.onChildAdded(msg);
                that.onPaneAdded(msg.child);
            }

            protected override onChildRemoved(msg: Widget.ChildMessage): void {
                super.onChildRemoved(msg);
                that.onPaneRemoved(msg.child);
            }
        }({
            spacing: 1, // --theia-border-width
            ...options
        });
        this.splitPanel.node.tabIndex = -1;
        layout.addWidget(this.splitPanel);

        this.navigatable = options?.navigatable;
    }

    get orientation(): SplitPanel.Orientation {
        return this.splitPanel.orientation;
    }

    set orientation(value: SplitPanel.Orientation) {
        this.splitPanel.orientation = value;
    }

    relativeSizes(): number[] {
        return this.splitPanel.relativeSizes();
    }

    setRelativeSizes(sizes: number[]): void {
        this.splitPanel.setRelativeSizes(sizes);
    }

    get handles(): readonly HTMLDivElement[] {
        return this.splitPanel.handles;
    }

    get saveable(): Saveable {
        return this.compositeSaveable;
    }

    getResourceUri(): URI | undefined {
        return this.navigatable?.getResourceUri();
    }

    createMoveToUri(resourceUri: URI): URI | undefined {
        return this.navigatable?.createMoveToUri(resourceUri);
    }

    storeState(): SplitWidget.State {
        return { orientation: this.orientation, widgets: this.panes, relativeSizes: this.relativeSizes() };
    }

    restoreState(oldState: SplitWidget.State): void {
        const { orientation, widgets, relativeSizes } = oldState;
        if (orientation) {
            this.orientation = orientation;
        }
        for (const widget of widgets) {
            this.addPane(widget);
        }
        if (relativeSizes) {
            this.setRelativeSizes(relativeSizes);
        }
    }

    get panes(): readonly Widget[] {
        return this.splitPanel.widgets;
    }

    getTrackableWidgets(): Widget[] {
        return [...this.panes];
    }

    protected fireDidChangeTrackableWidgets(): void {
        this.onDidChangeTrackableWidgetsEmitter.fire(this.getTrackableWidgets());
    }

    addPane(pane: Widget): void {
        this.splitPanel.addWidget(pane);
    }

    insertPane(index: number, pane: Widget): void {
        this.splitPanel.insertWidget(index, pane);
    }

    protected onPaneAdded(pane: Widget): void {
        if (Saveable.isSource(pane)) {
            this.compositeSaveable.add(pane.saveable);
        }
        this.fireDidChangeTrackableWidgets();
    }

    protected onPaneRemoved(pane: Widget): void {
        if (Saveable.isSource(pane)) {
            this.compositeSaveable.remove(pane.saveable);
        }
        this.fireDidChangeTrackableWidgets();
    }

    protected override onActivateRequest(msg: Message): void {
        this.splitPanel.node.focus();
    }
}

export namespace SplitWidget {
    export interface State {
        orientation?: SplitPanel.Orientation;
        widgets: readonly Widget[]; // note: don't rename this property; it has special meaning for `ShellLayoutRestorer`
        relativeSizes?: number[];
    }
}
