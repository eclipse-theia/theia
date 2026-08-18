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

import { ApplicationShell, PINNED_CLASS, Saveable } from '@theia/core/lib/browser';
import { TabBar, Title, Widget } from '@theia/core/shared/@lumino/widgets';
import { Disposable, DisposableCollection, Emitter, Event } from '@theia/core/lib/common';

export const PREVIEW_TITLE_CLASS = 'theia-editor-preview-title-unpinned';

/**
 * A widget that can be displayed as a reusable "preview" tab. A preview tab is rendered with an
 * italic (unpinned) title and is promoted to a permanent tab once its content becomes dirty,
 * its title is pinned, it is double-clicked, or it is moved to a different tab-bar.
 */
export interface PreviewTabWidget {
    readonly isPreview: boolean;
    readonly onDidChangePreviewState: Event<void>;
    initializePreview(): void;
    convertToNonPreview(): void;
}

export namespace PreviewTabWidget {
    export function is(arg: unknown): arg is Widget & PreviewTabWidget {
        return arg instanceof Widget
            && 'isPreview' in arg && typeof arg.isPreview === 'boolean'
            && 'onDidChangePreviewState' in arg && typeof arg.onDidChangePreviewState === 'function'
            && 'initializePreview' in arg && typeof arg.initializePreview === 'function'
            && 'convertToNonPreview' in arg && typeof arg.convertToNonPreview === 'function';
    }

    /**
     * Dispose every other preview widget sharing the target widget's tab-bar so that at most one
     * preview tab exists per editor group, regardless of the concrete preview widget types.
     */
    export function disposeOtherPreviews(shell: ApplicationShell, widget: Widget & PreviewTabWidget): void {
        if (!widget.isPreview) {
            return;
        }
        const tabbar = shell.getTabBarFor(widget);
        if (tabbar) {
            for (const title of tabbar.titles) {
                if (title.owner !== widget && is(title.owner) && title.owner.isPreview) {
                    title.owner.dispose();
                }
            }
        }
    }
}

/**
 * The host widget capabilities required by {@link PreviewTabSupport}.
 */
export interface PreviewTabHost {
    readonly title: Title<Widget>;
    readonly saveable: Saveable;
    readonly toDispose: DisposableCollection;
    /**
     * Invoked from {@link PreviewTabSupport.convertToNonPreview} to let the host perform additional
     * clean-up, e.g. resetting its tab-bar tracking.
     */
    onConvertToNonPreview?(): void;
}

/**
 * Reusable implementation of the {@link PreviewTabWidget} behavior. Widgets that cannot share a
 * common base class compose this and delegate their preview-related members to it.
 *
 * It only owns the preview *state* and its promotion triggers. Detecting a move between tab-bars is
 * left to the host (e.g. via `TabBarTracker`), which feeds {@link handleTabBarChange}; hosts whose
 * base class already tracks this (like `EditorWidget`) reuse that instead.
 */
export class PreviewTabSupport implements PreviewTabWidget {

    protected _isPreview = false;

    protected readonly onDidChangePreviewStateEmitter = new Emitter<void>();
    readonly onDidChangePreviewState = this.onDidChangePreviewStateEmitter.event;

    constructor(protected readonly host: PreviewTabHost) {
        this.host.toDispose.push(this.onDidChangePreviewStateEmitter);
    }

    get isPreview(): boolean {
        return this._isPreview;
    }

    initializePreview(): void {
        const oneTimeListeners = new DisposableCollection();
        this._isPreview = true;
        this.host.title.className += ` ${PREVIEW_TITLE_CLASS}`;
        const oneTimeDirtyChangeListener = this.host.saveable.onDirtyChanged(() => {
            this.convertToNonPreview();
            oneTimeListeners.dispose();
        });
        oneTimeListeners.push(oneTimeDirtyChangeListener);
        const oneTimeTitleChangeHandler = () => {
            if (this.host.title.className.includes(PINNED_CLASS)) {
                this.convertToNonPreview();
                oneTimeListeners.dispose();
            }
        };
        this.host.title.changed.connect(oneTimeTitleChangeHandler);
        oneTimeListeners.push(Disposable.create(() => this.host.title.changed.disconnect(oneTimeTitleChangeHandler)));
        this.host.toDispose.push(oneTimeListeners);
    }

    convertToNonPreview(): void {
        if (this._isPreview) {
            this._isPreview = false;
            this.host.onConvertToNonPreview?.();
            this.host.title.className = this.host.title.className.replace(PREVIEW_TITLE_CLASS, '');
            this.onDidChangePreviewStateEmitter.fire();
            this.onDidChangePreviewStateEmitter.dispose();
        }
    }

    /**
     * Promote the preview to a permanent tab when it is moved between two tab-bars.
     */
    handleTabBarChange(oldTabBar?: TabBar<Widget>, newTabBar?: TabBar<Widget>): void {
        if (this._isPreview && oldTabBar && newTabBar) {
            this.convertToNonPreview();
        }
    }
}
