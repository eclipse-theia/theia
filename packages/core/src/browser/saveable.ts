// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { Widget } from '@phosphor/widgets';
import { Message } from '@phosphor/messaging';
import { Event } from '../common/event';
import { MaybePromise } from '../common/types';
import { Key } from './keyboard/keys';
import { AbstractDialog } from './dialogs';
import { waitForClosed } from './widgets';
import { URI } from 'vscode-uri';

export interface Saveable {
    readonly dirty: boolean;
    readonly onDirtyChanged: Event<void>;
    readonly autoSave: 'off' | 'afterDelay' | 'onFocusChange' | 'onWindowChange';
    /**
     * Saves dirty changes.
     */
    save(options?: SaveOptions): MaybePromise<void>;
    /**
     * Reverts dirty changes.
     */
    revert?(options?: Saveable.RevertOptions): Promise<void>;
    /**
     * Creates a snapshot of the dirty state.
     */
    createSnapshot?(): Saveable.Snapshot;
    /**
     * Applies the given snapshot to the dirty state.
     */
    applySnapshot?(snapshot: object): void;
}

export interface SaveableSource {
    readonly saveable: Saveable;
}

export namespace Saveable {
    export interface RevertOptions {
        /**
         * If soft then only dirty flag should be updated, otherwise
         * the underlying data should be reverted as well.
         */
        soft?: boolean
    }

    export type Snapshot = { value: string } | { read(): string | null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function isSource(arg: any): arg is SaveableSource {
        return !!arg && ('saveable' in arg) && is(arg.saveable);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function is(arg: any): arg is Saveable {
        return !!arg && ('dirty' in arg) && ('onDirtyChanged' in arg);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function isUntitled(arg: any): boolean {
        return !!arg && ('uri' in arg) && URI.parse((arg as { uri: string; }).uri).scheme === 'untitled';
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function get(arg: any): Saveable | undefined {
        if (is(arg)) {
            return arg;
        }
        if (isSource(arg)) {
            return arg.saveable;
        }
        return undefined;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function getDirty(arg: any): Saveable | undefined {
        const saveable = get(arg);
        if (saveable && saveable.dirty) {
            return saveable;
        }
        return undefined;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function isDirty(arg: any): boolean {
        return !!getDirty(arg);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export async function save(arg: any, options?: SaveOptions): Promise<void> {
        const saveable = get(arg);
        if (saveable) {
            await saveable.save(options);
        }
    }

    async function closeWithoutSaving(this: PostCreationSaveableWidget, doRevert: boolean = true): Promise<void> {
        const saveable = get(this);
        if (saveable && doRevert && saveable.dirty && saveable.revert) {
            await saveable.revert();
        }
        this[close]();
        return waitForClosed(this);
    }

    function createCloseWithSaving(
        getOtherSaveables?: () => Array<Widget | SaveableWidget>,
        doSave?: (widget: Widget, options?: SaveOptions) => Promise<void>
    ): (this: SaveableWidget, options?: SaveableWidget.CloseOptions) => Promise<void> {
        let closing = false;
        return async function (this: SaveableWidget, options: SaveableWidget.CloseOptions): Promise<void> {
            if (closing) { return; }
            const saveable = get(this);
            if (!saveable) { return; }
            closing = true;
            try {
                const result = await shouldSave(saveable, () => {
                    const notLastWithDocument = !closingWidgetWouldLoseSaveable(this, getOtherSaveables?.() ?? []);
                    if (notLastWithDocument) {
                        return this.closeWithoutSaving(false).then(() => undefined);
                    }
                    if (options && options.shouldSave) {
                        return options.shouldSave();
                    }
                    return new ShouldSaveDialog(this).open();
                });
                if (typeof result === 'boolean') {
                    if (result) {
                        await (doSave?.(this) ?? Saveable.save(this));
                    }
                    await this.closeWithoutSaving();
                }
            } finally {
                closing = false;
            }
        };
    }

    export async function confirmSaveBeforeClose(toClose: Iterable<Widget>, others: Widget[]): Promise<boolean | undefined> {
        for (const widget of toClose) {
            const saveable = Saveable.get(widget);
            if (saveable?.dirty) {
                if (!closingWidgetWouldLoseSaveable(widget, others)) {
                    continue;
                }
                const userWantsToSave = await new ShouldSaveDialog(widget).open();
                if (userWantsToSave === undefined) { // User clicked cancel.
                    return undefined;
                } else if (userWantsToSave) {
                    await saveable.save();
                } else {
                    await saveable.revert?.();
                }
            }
        }
        return true;
    }

    /**
     * @param widget the widget that may be closed
     * @param others widgets that will not be closed.
     * @returns `true` if widget is saveable and no widget among the `others` refers to the same saveable. `false` otherwise.
     */
    function closingWidgetWouldLoseSaveable(widget: Widget, others: Widget[]): boolean {
        const saveable = get(widget);
        return !!saveable && !others.some(otherWidget => otherWidget !== widget && get(otherWidget) === saveable);
    }

    export function apply(
        widget: Widget,
        getOtherSaveables?: () => Array<Widget | SaveableWidget>,
        doSave?: (widget: Widget, options?: SaveOptions) => Promise<void>,
    ): SaveableWidget | undefined {
        if (SaveableWidget.is(widget)) {
            return widget;
        }
        const saveable = Saveable.get(widget);
        if (!saveable) {
            return undefined;
        }
        const saveableWidget = widget as SaveableWidget;
        setDirty(saveableWidget, saveable.dirty);
        saveable.onDirtyChanged(() => setDirty(saveableWidget, saveable.dirty));
        const closeWithSaving = createCloseWithSaving(getOtherSaveables, doSave);
        return Object.assign(saveableWidget, {
            closeWithoutSaving,
            closeWithSaving,
            close: closeWithSaving,
            [close]: saveableWidget.close,
        });
    }
    export async function shouldSave(saveable: Saveable, cb: () => MaybePromise<boolean | undefined>): Promise<boolean | undefined> {
        if (!saveable.dirty) {
            return false;
        }

        if (saveable.autoSave !== 'off') {
            return true;
        }

        return cb();
    }
}

export interface SaveableWidget extends Widget {
    /**
     * @param doRevert whether the saveable should be reverted before being saved. Defaults to `true`.
     */
    closeWithoutSaving(doRevert?: boolean): Promise<void>;
    closeWithSaving(options?: SaveableWidget.CloseOptions): Promise<void>;
}

export const close = Symbol('close');
/**
 * An interface describing saveable widgets that are created by the `Saveable.apply` function.
 * The original `close` function is reassigned to a locally-defined `Symbol`
 */
export interface PostCreationSaveableWidget extends SaveableWidget {
    /**
     * The original `close` function of the widget
     */
    [close](): void;
}
export namespace SaveableWidget {
    export function is(widget: Widget | undefined): widget is SaveableWidget {
        return !!widget && 'closeWithoutSaving' in widget;
    }
    export function getDirty<T extends Widget>(widgets: Iterable<T>): IterableIterator<SaveableWidget & T> {
        return get(widgets, Saveable.isDirty);
    }
    export function* get<T extends Widget>(
        widgets: Iterable<T>,
        filter: (widget: T) => boolean = () => true
    ): IterableIterator<SaveableWidget & T> {
        for (const widget of widgets) {
            if (SaveableWidget.is(widget) && filter(widget)) {
                yield widget;
            }
        }
    }
    export interface CloseOptions {
        shouldSave?(): MaybePromise<boolean | undefined>
    }
}

/**
 * Possible formatting types when saving.
 */
export const enum FormatType {
    /**
     * Formatting should occur (default).
     */
    ON = 1,
    /**
     * Formatting should not occur.
     */
    OFF,
    /**
     * Formatting should only occur if the resource is dirty.
     */
    DIRTY
};

export interface SaveOptions {
    /**
     * Formatting type to apply when saving.
     */
    readonly formatType?: FormatType;
}

/**
 * The class name added to the dirty widget's title.
 */
const DIRTY_CLASS = 'theia-mod-dirty';
export function setDirty(widget: Widget, dirty: boolean): void {
    const dirtyClass = ` ${DIRTY_CLASS}`;
    widget.title.className = widget.title.className.replace(dirtyClass, '');
    if (dirty) {
        widget.title.className += dirtyClass;
    }
}

export class ShouldSaveDialog extends AbstractDialog<boolean> {

    protected shouldSave = true;

    protected readonly dontSaveButton: HTMLButtonElement;

    constructor(widget: Widget) {
        super({
            title: `Do you want to save the changes you made to ${widget.title.label || widget.title.caption}?`
        });

        const messageNode = document.createElement('div');
        messageNode.textContent = "Your changes will be lost if you don't save them.";
        messageNode.setAttribute('style', 'flex: 1 100%; padding-bottom: calc(var(--theia-ui-padding)*3);');
        this.contentNode.appendChild(messageNode);
        this.dontSaveButton = this.appendDontSaveButton();
        this.appendCloseButton();
        this.appendAcceptButton('Save');
    }

    protected appendDontSaveButton(): HTMLButtonElement {
        const button = this.createButton("Don't save");
        this.controlPanel.appendChild(button);
        button.classList.add('secondary');
        return button;
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.addKeyListener(this.dontSaveButton, Key.ENTER, () => {
            this.shouldSave = false;
            this.accept();
        }, 'click');
    }

    get value(): boolean {
        return this.shouldSave;
    }

}
