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
import { UNTITLED_SCHEME, URI, Disposable, DisposableCollection, Emitter, Event } from '../common';
import { Navigatable, NavigatableWidget } from './navigatable-types';
import { AutoSaveMode, Saveable, SaveableSource, SaveableWidget, SaveOptions, SaveReason, setDirty, close, PostCreationSaveableWidget, ShouldSaveDialog } from './saveable';
import { waitForClosed, Widget } from './widgets';
import { FrontendApplicationContribution } from './frontend-application-contribution';
import { FrontendApplication } from './frontend-application';
import throttle = require('lodash.throttle');

@injectable()
export class SaveableService implements FrontendApplicationContribution {

    protected saveThrottles = new Map<Widget, AutoSaveThrottle>();
    protected saveMode: AutoSaveMode = 'off';
    protected saveDelay = 1000;
    protected shell: ApplicationShell;

    protected readonly onDidAutoSaveChangeEmitter = new Emitter<AutoSaveMode>();
    protected readonly onDidAutoSaveDelayChangeEmitter = new Emitter<number>();

    get onDidAutoSaveChange(): Event<AutoSaveMode> {
        return this.onDidAutoSaveChangeEmitter.event;
    }

    get onDidAutoSaveDelayChange(): Event<number> {
        return this.onDidAutoSaveDelayChangeEmitter.event;
    }

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
            this.saveThrottles.get(e)?.dispose();
            this.saveThrottles.delete(e);
        });
    }

    protected updateAutoSaveMode(mode: AutoSaveMode): void {
        this.saveMode = mode;
        this.onDidAutoSaveChangeEmitter.fire(mode);
        if (mode === 'onFocusChange') {
            // If the new mode is onFocusChange, we need to save all dirty documents that are not focused
            if (!this.shell) {
                // Shell is not ready yet, skip auto-saving widgets
                return;
            }
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
        this.onDidAutoSaveDelayChangeEmitter.fire(delay);
    }

    registerSaveable(widget: Widget, saveable: Saveable): Disposable {
        const saveThrottle = new AutoSaveThrottle(
            saveable,
            this,
            () => {
                if (this.saveMode === 'afterDelay' && this.shouldAutoSave(widget, saveable)) {
                    saveable.save({
                        saveReason: SaveReason.AfterDelay
                    });
                }
            },
            this.addBlurListener(widget, saveable)
        );
        this.saveThrottles.set(widget, saveThrottle);
        this.applySaveableWidget(widget, saveable);
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
            return saveable.autosaveable !== false && saveable.dirty;
        }
    }

    protected applySaveableWidget(widget: Widget, saveable: Saveable): void {
        if (SaveableWidget.is(widget)) {
            return;
        }
        const saveableWidget = widget as PostCreationSaveableWidget;
        setDirty(saveableWidget, saveable.dirty);
        saveable.onDirtyChanged(() => setDirty(saveableWidget, saveable.dirty));
        const closeWithSaving = this.createCloseWithSaving();
        const closeWithoutSaving = async () => {
            const revert = Saveable.closingWidgetWouldLoseSaveable(saveableWidget, Array.from(this.saveThrottles.keys()));
            await this.closeWithoutSaving(saveableWidget, revert);
        };
        Object.assign(saveableWidget, {
            closeWithoutSaving,
            closeWithSaving,
            close: closeWithSaving,
            [close]: saveableWidget.close,
        });
    }

    protected createCloseWithSaving(): (this: SaveableWidget, options?: SaveableWidget.CloseOptions) => Promise<void> {
        let closing = false;
        const doSave = this.closeWithSaving.bind(this);
        return async function (this: SaveableWidget, options?: SaveableWidget.CloseOptions): Promise<void> {
            if (closing) {
                return;
            }
            closing = true;
            try {
                await doSave(this, options);
            } finally {
                closing = false;
            }
        };
    }

    protected async closeWithSaving(widget: PostCreationSaveableWidget, options?: SaveableWidget.CloseOptions): Promise<void> {
        const result = await this.shouldSaveWidget(widget, options);
        if (typeof result === 'boolean') {
            if (result) {
                await this.save(widget, {
                    saveReason: SaveReason.AfterDelay
                });
                if (!Saveable.isDirty(widget)) {
                    await widget.closeWithoutSaving();
                }
            } else {
                await widget.closeWithoutSaving();
            }
        }
    }

    protected async shouldSaveWidget(widget: PostCreationSaveableWidget, options?: SaveableWidget.CloseOptions): Promise<boolean | undefined> {
        if (!Saveable.isDirty(widget)) {
            return false;
        }
        const saveable = Saveable.get(widget);
        if (!saveable) {
            console.warn('Saveable.get returned undefined on a known saveable widget. This is unexpected.');
        }
        // Enter branch if saveable absent since we cannot check autosaveability more definitely.
        if (this.autoSave !== 'off' && (!saveable || this.shouldAutoSave(widget, saveable))) {
            return true;
        }
        const notLastWithDocument = !Saveable.closingWidgetWouldLoseSaveable(widget, Array.from(this.saveThrottles.keys()));
        if (notLastWithDocument) {
            await widget.closeWithoutSaving(false);
            return undefined;
        }
        if (options && options.shouldSave) {
            return options.shouldSave();
        }
        return new ShouldSaveDialog(widget).open();
    }

    protected async closeWithoutSaving(widget: PostCreationSaveableWidget, doRevert: boolean = true): Promise<void> {
        const saveable = Saveable.get(widget);
        if (saveable && doRevert && saveable.dirty && saveable.revert) {
            await saveable.revert();
        }
        widget[close]();
        return waitForClosed(widget);
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
    private _callback: () => void;
    private _saveService: SaveableService;
    private _disposable: DisposableCollection;
    private _throttle?: ReturnType<typeof throttle>;

    constructor(saveable: Saveable, saveService: SaveableService, callback: () => void, ...disposables: Disposable[]) {
        this._callback = callback;
        this._saveable = saveable;
        this._saveService = saveService;
        this._disposable = new DisposableCollection(
            ...disposables,
            saveable.onContentChanged(() => {
                this.throttledSave();
            }),
            saveable.onDirtyChanged(() => {
                this.throttledSave();
            }),
            saveService.onDidAutoSaveChange(() => {
                this.throttledSave();
            }),
            saveService.onDidAutoSaveDelayChange(() => {
                this.throttledSave(true);
            })
        );
    }

    protected throttledSave(reset = false): void {
        this._throttle?.cancel();
        if (reset) {
            this._throttle = undefined;
        }
        if (this._saveService.autoSave === 'afterDelay' && this._saveable.dirty) {
            if (!this._throttle) {
                this._throttle = throttle(() => this._callback(), this._saveService.autoSaveDelay, {
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
