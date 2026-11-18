// *****************************************************************************
// Copyright (C) 2026 JuliaHub and others.
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

import { inject, injectable, postConstruct } from 'inversify';
import { Emitter, Event } from '../../common/event.js';
import { Deferred } from '../../common/promise-util.js';
import { LocalStorageService } from '../storage-service.js';

export const SidePanelItemVisibility = Symbol('SidePanelItemVisibility');
/**
 * Tracks which side panel items are hidden from the side bar. A hidden item keeps its widget
 * attached: its view still opens through commands and its tab shows while it is the current one.
 * Items are identified by the id of the widget that owns the tab.
 */
export interface SidePanelItemVisibility {
    /** Fires with the id of the widget whose hidden state the user changed. */
    readonly onDidChange: Event<string>;
    /** Fires when the user's choices are discarded and every item falls back to its default. */
    readonly onDidReset: Event<void>;
    /** Resolves once the user's stored choices are loaded; until then every item has its default state. */
    readonly ready: Promise<void>;
    isHidden(widgetId: string): boolean;
    setHidden(widgetId: string, hidden: boolean): void;
    /** Discards the user's choices so every item falls back to its default. */
    reset(): void;
}

/**
 * To keep the user's choices somewhere other than local storage, override `load()` and `save()`
 * rather than rebinding `LocalStorageService`, which every other consumer of it shares.
 */
@injectable()
export class SidePanelItemVisibilityImpl implements SidePanelItemVisibility {

    static readonly STORAGE_KEY = 'sidePanel.hiddenItems';

    /** Hidden items hold across workspaces, and `@theia/workspace` scopes the bound `StorageService` per workspace. */
    @inject(LocalStorageService)
    protected readonly storageService: LocalStorageService;

    protected readonly onDidChangeEmitter = new Emitter<string>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    protected readonly onDidResetEmitter = new Emitter<void>();
    readonly onDidReset = this.onDidResetEmitter.event;

    protected readonly loaded = new Deferred<void>();
    readonly ready = this.loaded.promise;

    /** Explicit user choices only, so items the user never touched follow `isHiddenByDefault`. */
    protected overrides: Record<string, boolean> = {};

    @postConstruct()
    protected init(): void {
        this.load().finally(() => this.loaded.resolve());
    }

    protected async load(): Promise<void> {
        const stored = await this.storageService.getData<Record<string, boolean>>(SidePanelItemVisibilityImpl.STORAGE_KEY);
        this.overrides = { ...stored, ...this.overrides };
    }

    isHidden(widgetId: string): boolean {
        return this.overrides[widgetId] ?? this.isHiddenByDefault(widgetId);
    }

    setHidden(widgetId: string, hidden: boolean): void {
        if (this.isHidden(widgetId) === hidden) {
            return;
        }
        this.overrides[widgetId] = hidden;
        this.save();
        this.onDidChangeEmitter.fire(widgetId);
    }

    reset(): void {
        if (Object.keys(this.overrides).length === 0) {
            return;
        }
        this.overrides = {};
        this.save();
        this.onDidResetEmitter.fire();
    }

    /**
     * Whether an item the user has neither hidden nor shown starts hidden. Override this to
     * give an application its own defaults.
     *
     * Defaults are not limited to leaving one item visible per side the way the user's choices are,
     * so an application can start every item on a side hidden. Expanding a side panel without naming
     * a view can still open a hidden item, through the last active index or the first tab, and its
     * tab then shows while it is current, the same as opening it by command.
     */
    protected isHiddenByDefault(widgetId: string): boolean {
        return false;
    }

    protected save(): void {
        const data = Object.keys(this.overrides).length > 0 ? this.overrides : undefined;
        this.storageService.setData(SidePanelItemVisibilityImpl.STORAGE_KEY, data);
    }
}
