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
import { Emitter, Event } from '../../common/event';
import { StorageService } from '../storage-service';

export const SidePanelItemVisibility = Symbol('SidePanelItemVisibility');
/**
 * Tracks which side panel items are hidden from the side bar. A hidden item keeps its widget
 * attached: its view still opens through commands and its tab shows while it is the current one.
 * Items are identified by the id of the widget that owns the tab.
 */
export interface SidePanelItemVisibility {
    /** Fires with the widget id whose hidden state changed, or `undefined` when all of them may have. */
    readonly onDidChange: Event<string | undefined>;
    isHidden(widgetId: string): boolean;
    setHidden(widgetId: string, hidden: boolean): void;
    /** Discards the user's choices so every item falls back to its default. */
    reset(): void;
}

@injectable()
export class SidePanelItemVisibilityImpl implements SidePanelItemVisibility {

    protected static readonly STORAGE_KEY = 'sidePanel.hiddenItems';

    @inject(StorageService)
    protected readonly storageService: StorageService;

    protected readonly onDidChangeEmitter = new Emitter<string | undefined>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    /** Explicit user choices only, so items the user never touched follow `isHiddenByDefault`. */
    protected overrides: Record<string, boolean> = {};

    @postConstruct()
    protected init(): void {
        this.storageService.getData<Record<string, boolean>>(SidePanelItemVisibilityImpl.STORAGE_KEY).then(stored => {
            if (stored) {
                this.overrides = { ...stored, ...this.overrides };
                this.onDidChangeEmitter.fire(undefined);
            }
        });
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
        this.overrides = {};
        this.save();
        this.onDidChangeEmitter.fire(undefined);
    }

    /**
     * Whether an item the user has neither hidden nor shown starts hidden. Override this to
     * give an application its own defaults.
     */
    protected isHiddenByDefault(widgetId: string): boolean {
        return false;
    }

    protected save(): void {
        const data = Object.keys(this.overrides).length > 0 ? this.overrides : undefined;
        this.storageService.setData(SidePanelItemVisibilityImpl.STORAGE_KEY, data);
    }
}
