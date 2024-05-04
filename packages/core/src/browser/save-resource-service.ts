/********************************************************************************
 * Copyright (C) 2022 Arm and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/

import type { ApplicationShell } from './shell';
import { injectable } from 'inversify';
import { UNTITLED_SCHEME, URI, Disposable, DisposableCollection } from '../common';
import { Navigatable, NavigatableWidget } from './navigatable-types';
import { AutoSaveMode, Saveable, SaveableSource, SaveOptions, SaveReason } from './saveable';
import { Widget } from './widgets';
import { FrontendApplicationContribution } from './frontend-application-contribution';
import { FrontendApplication } from './frontend-application';
import throttle = require('lodash.throttle');

@injectable()
export class SaveResourceService implements FrontendApplicationContribution {

    protected saveThrottles = new Map<Saveable, AutoSaveThrottle>();
    protected saveMode: AutoSaveMode = 'off';
    protected saveDelay = 1000;
    protected shell: ApplicationShell;

    get autoSave(): AutoSaveMode {
        return this.saveMode;
    }

    set autoSave(value: AutoSaveMode) {
        this.updateAutoSaveMode(value);
    }

    get autoSaveDelay(): number {
        return this.saveDelay;
    }

    set autoSaveDelay(value: number) {
        this.updateAutoSaveDelay(value);
    }

    onDidInitializeLayout(app: FrontendApplication): void {
        this.shell = app.shell;
        // Register restored editors first
        for (const widget of this.shell.widgets) {
            const saveable = Saveable.get(widget);
            if (saveable) {
                this.registerSaveable(widget, saveable);
            }
        }
        this.shell.onDidAddWidget(e => {
            const saveable = Saveable.get(e);
            if (saveable) {
                this.registerSaveable(e, saveable);
            }
        });
        this.shell.onDidChangeCurrentWidget(e => {
            if (this.saveMode === 'onFocusChange') {
                const widget = e.oldValue;
                const saveable = Saveable.get(widget);
                if (saveable && widget && this.shouldAutoSave(widget, saveable)) {
                    saveable.save({
                        saveReason: SaveReason.FocusChange
                    });
                }
            }
        });
        this.shell.onDidRemoveWidget(e => {
            const saveable = Saveable.get(e);
            if (saveable) {
                this.saveThrottles.get(saveable)?.dispose();
                this.saveThrottles.delete(saveable);
            }
        });
    }

    protected updateAutoSaveMode(mode: AutoSaveMode): void {
        this.saveMode = mode;
        for (const saveThrottle of this.saveThrottles.values()) {
            saveThrottle.autoSave = mode;
        }
        if (mode === 'onFocusChange') {
            // If the new mode is onFocusChange, we need to save all dirty documents that are not focused
            const widgets = this.shell.widgets;
            for (const widget of widgets) {
                const saveable = Saveable.get(widget);
                if (saveable && widget !== this.shell.currentWidget && this.shouldAutoSave(widget, saveable)) {
                    saveable.save({
                        saveReason: SaveReason.FocusChange
                    });
                }
            }
        }
    }

    protected updateAutoSaveDelay(delay: number): void {
        this.saveDelay = delay;
        for (const saveThrottle of this.saveThrottles.values()) {
            saveThrottle.autoSaveDelay = delay;
        }
    }

    registerSaveable(widget: Widget, saveable: Saveable): Disposable {
        const saveThrottle = new AutoSaveThrottle(
            saveable,
            () => {
                if (this.saveMode === 'afterDelay' && this.shouldAutoSave(widget, saveable)) {
                    saveable.save({
                        saveReason: SaveReason.AfterDelay
                    });
                }
            },
            this.addBlurListener(widget, saveable)
        );
        saveThrottle.autoSave = this.saveMode;
        saveThrottle.autoSaveDelay = this.saveDelay;
        this.saveThrottles.set(saveable, saveThrottle);
        return saveThrottle;
    }

    protected addBlurListener(widget: Widget, saveable: Saveable): Disposable {
        const document = widget.node.ownerDocument;
        const listener = (() => {
            if (this.saveMode === 'onWindowChange' && !this.windowHasFocus(document) && this.shouldAutoSave(widget, saveable)) {
                saveable.save({
                    saveReason: SaveReason.FocusChange
                });
            }
        }).bind(this);
        document.addEventListener('blur', listener);
        return Disposable.create(() => {
            document.removeEventListener('blur', listener);
        });
    }

    protected windowHasFocus(document: Document): boolean {
        if (document.visibilityState === 'hidden') {
            return false;
        } else if (document.hasFocus()) {
            return true;
        }
        // TODO: Add support for iframes
        return false;
    }

    protected shouldAutoSave(widget: Widget, saveable: Saveable): boolean {
        const uri = NavigatableWidget.getUri(widget);
        if (uri?.scheme === UNTITLED_SCHEME) {
            // Never auto-save untitled documents
            return false;
        } else {
            return saveable.dirty;
        }
    }

    /**
     * Indicate if the document can be saved ('Save' command should be disable if not).
     */
    canSave(widget?: Widget): widget is Widget & (Saveable | SaveableSource) {
        return Saveable.isDirty(widget) && (this.canSaveNotSaveAs(widget) || this.canSaveAs(widget));
    }

    canSaveNotSaveAs(widget?: Widget): widget is Widget & (Saveable | SaveableSource) {
        // By default, we never allow a document to be saved if it is untitled.
        return Boolean(widget && NavigatableWidget.getUri(widget)?.scheme !== UNTITLED_SCHEME);
    }

    /**
     * Saves the document
     *
     * No op if the widget is not saveable.
     */
    async save(widget: Widget | undefined, options?: SaveOptions): Promise<URI | undefined> {
        if (this.canSaveNotSaveAs(widget)) {
            await Saveable.save(widget, options);
            return NavigatableWidget.getUri(widget);
        } else if (this.canSaveAs(widget)) {
            return this.saveAs(widget, options);
        }
    }

    canSaveAs(saveable?: Widget): saveable is Widget & SaveableSource & Navigatable {
        return false;
    }

    saveAs(sourceWidget: Widget & SaveableSource & Navigatable, options?: SaveOptions): Promise<URI | undefined> {
        return Promise.reject('Unsupported: The base SaveResourceService does not support saveAs action.');
    }
}

export class AutoSaveThrottle implements Disposable {

    private _saveable: Saveable;
    private _cb: () => void;
    private _disposable: DisposableCollection;
    private _throttle?: ReturnType<typeof throttle>;
    private _mode: AutoSaveMode = 'off';
    private _autoSaveDelay = 1000;

    get autoSave(): AutoSaveMode {
        return this._mode;
    }

    set autoSave(value: AutoSaveMode) {
        this._mode = value;
        this.throttledSave();
    }

    get autoSaveDelay(): number {
        return this._autoSaveDelay;
    }

    set autoSaveDelay(value: number) {
        this._autoSaveDelay = value;
        // Explicitly delete the throttle to recreate it with the new delay
        this._throttle?.cancel();
        this._throttle = undefined;
        this.throttledSave();
    }

    constructor(saveable: Saveable, cb: () => void, ...disposables: Disposable[]) {
        this._cb = cb;
        this._saveable = saveable;
        this._disposable = new DisposableCollection(
            ...disposables,
            saveable.onContentChanged(() => {
                this.throttledSave();
            }),
            saveable.onDirtyChanged(() => {
                this.throttledSave();
            })
        );
    }

    protected throttledSave(): void {
        this._throttle?.cancel();
        if (this._mode === 'afterDelay' && this._saveable.dirty) {
            if (!this._throttle) {
                this._throttle = throttle(() => this._cb(), this._autoSaveDelay, {
                    leading: false,
                    trailing: true
                });
            }
            this._throttle();
        }
    }

    dispose(): void {
        this._disposable.dispose();
    }

}
