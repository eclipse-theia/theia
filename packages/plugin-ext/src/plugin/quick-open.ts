// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    QuickOpenExt, PLUGIN_RPC_CONTEXT as Ext, QuickOpenMain, TransferInputBox, Plugin,
    TransferQuickInputButton, TransferQuickInput, TransferQuickPickItem
} from '../common/plugin-api-rpc';
import * as theia from '@theia/plugin';
import { CancellationToken } from '@theia/core/lib/common/cancellation';
import { RPCProtocol } from '../common/rpc-protocol';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { InputBoxValidationSeverity, QuickInputButtons, QuickPickItemKind, ThemeIcon } from './types-impl';
import { URI } from '@theia/core/shared/vscode-uri';
import * as path from 'path';
import { convertToTransferQuickPickItems } from './type-converters';
import { PluginPackage } from '../common/plugin-protocol';
import { QuickInputButtonHandle } from '@theia/core/lib/browser';
import { MaybePromise } from '@theia/core/lib/common/types';
import { Severity } from '@theia/core/lib/common/severity';
import { PluginIconPath } from './plugin-icon-path';

const canceledName = 'Canceled';
/**
 * Checks if the given error is a promise in canceled state
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isPromiseCanceledError(error: any): boolean {
    return error instanceof Error && error.name === canceledName && error.message === canceledName;
}

type Item = theia.QuickPickItem | string;

export class QuickOpenExtImpl implements QuickOpenExt {
    private proxy: QuickOpenMain;
    private onDidSelectItem: undefined | ((handle: number) => void);
    private validateInputHandler?: (input: string) => MaybePromise<string | theia.InputBoxValidationMessage | null | undefined>;
    private _sessions = new Map<number, QuickInputExt>(); // Each quickinput will have a number so that we know where to fire events
    private _instances = 0;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(Ext.QUICK_OPEN_MAIN);
    }

    /* eslint-disable max-len */
    showQuickPick(plugin: Plugin, itemsOrItemsPromise: theia.QuickPickItem[] | Promise<theia.QuickPickItem[]>, options: theia.QuickPickOptions & { canPickMany: true; }, token?: theia.CancellationToken): Promise<Array<theia.QuickPickItem> | undefined>;
    showQuickPick(plugin: Plugin, itemsOrItemsPromise: string[] | Promise<string[]>, options?: theia.QuickPickOptions, token?: theia.CancellationToken): Promise<string | undefined>;
    showQuickPick(plugin: Plugin, itemsOrItemsPromise: theia.QuickPickItem[] | Promise<theia.QuickPickItem[]>, options?: theia.QuickPickOptions, token?: theia.CancellationToken): Promise<theia.QuickPickItem | undefined>;
    showQuickPick(plugin: Plugin, itemsOrItemsPromise: Item[] | Promise<Item[]>, options?: theia.QuickPickOptions, token: theia.CancellationToken = CancellationToken.None): Promise<Item | Item[] | undefined> {
        this.onDidSelectItem = undefined;

        const itemsPromise = Promise.resolve(itemsOrItemsPromise);

        const instance = ++this._instances;

        const widgetPromise = this.proxy.$show(instance, {
            title: options && options.title,
            canPickMany: options && options.canPickMany,
            placeHolder: options && options.placeHolder,
            matchOnDescription: options && options.matchOnDescription,
            matchOnDetail: options && options.matchOnDetail,
            ignoreFocusLost: options && options.ignoreFocusOut
        }, token);

        const widgetClosedMarker = {};
        const widgetClosedPromise = widgetPromise.then(() => widgetClosedMarker);

        return Promise.race([widgetClosedPromise, itemsPromise]).then(result => {
            if (result === widgetClosedMarker) {
                return undefined;
            }
            return itemsPromise.then(async items => {
                const pickItems = convertToTransferQuickPickItems(plugin, items);

                if (options && typeof options.onDidSelectItem === 'function') {
                    this.onDidSelectItem = handle => {
                        options.onDidSelectItem!(items[handle]);
                    };
                }

                this.proxy.$setItems(instance, pickItems);

                return widgetPromise.then(handle => {
                    if (typeof handle === 'number') {
                        if (options && options.canPickMany) {
                            return Array.of(items[handle]);
                        } else {
                            return items[handle];
                        }

                    } else if (Array.isArray(handle)) {
                        return handle.map(h => items[h]);
                    }
                    return undefined;
                });
            });
        }).then(undefined, err => {
            if (isPromiseCanceledError(err)) {
                return undefined;
            }

            this.proxy.$setError(instance, err);

            return Promise.reject(err);
        });
    }

    $onItemSelected(handle: number): void {
        if (this.onDidSelectItem) {
            this.onDidSelectItem(handle);
        }
    }

    // ---- input

    showInput(options?: theia.InputBoxOptions, token: theia.CancellationToken = CancellationToken.None): PromiseLike<string | undefined> {
        this.validateInputHandler = options?.validateInput;
        if (!options) { options = { placeHolder: '' }; }
        return this.proxy.$input(options, typeof this.validateInputHandler === 'function', token);
    }

    async showInputBox(options: TransferInputBox): Promise<string | undefined> {
        this.validateInputHandler = typeof options.validateInput === 'function' ? options.validateInput : undefined;
        return this.proxy.$showInputBox(options, typeof this.validateInputHandler === 'function');
    }

    async $validateInput(input: string): Promise<string | { content: string; severity: Severity; } | null | undefined> {
        if (!this.validateInputHandler) {
            return;
        }

        const result = await this.validateInputHandler(input);
        if (!result || typeof result === 'string') {
            return result;
        }

        let severity: Severity;
        switch (result.severity) {
            case InputBoxValidationSeverity.Info:
                severity = Severity.Info;
                break;
            case InputBoxValidationSeverity.Warning:
                severity = Severity.Warning;
                break;
            case InputBoxValidationSeverity.Error:
                severity = Severity.Error;
                break;
            default:
                severity = result.message ? Severity.Error : Severity.Ignore;
                break;
        }

        return {
            content: result.message,
            severity
        };
    }

    // ---- QuickInput

    createQuickPick<T extends theia.QuickPickItem>(plugin: Plugin): theia.QuickPick<T> {
        const session: any = new QuickPickExt<T>(this, this.proxy, plugin, () => this._sessions.delete(session._id));
        this._sessions.set(session._id, session);
        return session;
    }

    createInputBox(plugin: Plugin): theia.InputBox {
        const session: any = new InputBoxExt(this, this.proxy, plugin, () => this._sessions.delete(session._id));
        this._sessions.set(session._id, session);
        return session;
    }

    hide(): void {
        this.proxy.$hide();
    }

    async $acceptOnDidAccept(sessionId: number): Promise<void> {
        const session = this._sessions.get(sessionId);
        if (session) {
            session._fireAccept();
        }
    }

    async $acceptDidChangeValue(sessionId: number, changedValue: string): Promise<void> {
        const session = this._sessions.get(sessionId);
        if (session) {
            session._fireChangedValue(changedValue);
        }
    }

    async $acceptOnDidHide(sessionId: number): Promise<void> {
        const session = this._sessions.get(sessionId);
        if (session) {
            session._fireHide();
        }
    }

    async $acceptOnDidTriggerButton(sessionId: number, btn: QuickInputButtonHandle): Promise<void> {
        const session = this._sessions.get(sessionId);
        if (session) {
            if (btn.handle === -1) {
                session._fireButtonTrigger(QuickInputButtons.Back);
            } else if (session && (session instanceof InputBoxExt || session instanceof QuickPickExt)) {
                const btnFromHandle = session.buttons[btn.handle];
                session._fireButtonTrigger(btnFromHandle as theia.QuickInputButton);
            }
        }
    }

    $onDidChangeActive(sessionId: number, handles: number[]): void {
        const session = this._sessions.get(sessionId);
        if (session instanceof QuickPickExt) {
            session._fireDidChangeActive(handles);
        }
    }

    $onDidChangeSelection(sessionId: number, handles: number[]): void {
        const session = this._sessions.get(sessionId);
        if (session instanceof QuickPickExt) {
            session._fireDidChangeSelection(handles);
        }
    }

    $onDidTriggerItemButton(sessionId: number, itemHandle: number, buttonHandle: number): void {
        const session = this._sessions.get(sessionId);
        if (session instanceof QuickPickExt) {
            session._fireDidTriggerItemButton(itemHandle, buttonHandle);
        }
    }

}

export class QuickInputExt implements theia.QuickInput {

    private static _nextId = 1;
    _id = QuickInputExt._nextId++;

    private _busy: boolean;
    private _enabled: boolean;
    private _ignoreFocusOut: boolean;
    private _step: number | undefined;
    private _title: string | undefined;
    private _totalSteps: number | undefined;
    private _value: string;
    private _placeholder: string | undefined;
    private _buttons: theia.QuickInputButton[] = [];
    private _handlesToButtons = new Map<number, theia.QuickInputButton>();
    protected expectingHide = false;
    protected visible: boolean;
    private _disposed = false;
    protected disposableCollection: DisposableCollection;

    private onDidAcceptEmitter: Emitter<void>;
    /**
     * it has to be named `_onDidChangeValueEmitter`, since Gitlens extension relies on it
     * https://github.com/eamodio/vscode-gitlens/blob/f22a9cd4199ac498c217643282a6a412e1fc01ae/src/commands/gitCommands.ts#L242-L243
     */
    private _onDidChangeValueEmitter: Emitter<string>;
    private onDidHideEmitter: Emitter<void>;
    private onDidTriggerButtonEmitter: Emitter<theia.QuickInputButton>;
    private _updateTimeout: any;
    private _pendingUpdate: TransferQuickInput = { id: this._id };

    constructor(readonly quickOpen: QuickOpenExtImpl, readonly quickOpenMain: QuickOpenMain, readonly plugin: Plugin, private _onDidDispose: () => void) {
        this.title = undefined;
        this.step = undefined;
        this.totalSteps = undefined;
        this.enabled = true;
        this.busy = false;
        this.ignoreFocusOut = false;
        this.value = '';

        this.visible = false;

        this.disposableCollection = new DisposableCollection();
        this.disposableCollection.push(this.onDidAcceptEmitter = new Emitter());
        this.disposableCollection.push(this._onDidChangeValueEmitter = new Emitter());
        this.disposableCollection.push(this.onDidHideEmitter = new Emitter());
        this.disposableCollection.push(this.onDidTriggerButtonEmitter = new Emitter());
    }

    get title(): string | undefined {
        return this._title;
    }

    set title(title: string | undefined) {
        this._title = title;
        this.update({ title });
    }

    get step(): number | undefined {
        return this._step;
    }

    set step(step: number | undefined) {
        this._step = step;
        this.update({ step });
    }

    get totalSteps(): number | undefined {
        return this._totalSteps;
    }

    set totalSteps(totalSteps: number | undefined) {
        this._totalSteps = totalSteps;
        this.update({ totalSteps });
    }

    get enabled(): boolean {
        return this._enabled;
    }

    set enabled(enabled: boolean) {
        this._enabled = enabled;
        this.update({ enabled });
    }

    get busy(): boolean {
        return this._busy;
    }

    set busy(busy: boolean) {
        this._busy = busy;
        this.update({ busy });
    }

    get ignoreFocusOut(): boolean {
        return this._ignoreFocusOut;
    }

    set ignoreFocusOut(ignoreFocusOut: boolean) {
        this._ignoreFocusOut = ignoreFocusOut;
        this.update({ ignoreFocusOut });
    }

    get value(): string {
        return this._value;
    }

    set value(value: string) {
        this._value = value;
        this.update({ value });
    }

    get placeholder(): string | undefined {
        return this._placeholder;
    }

    set placeholder(placeholder: string | undefined) {
        this._placeholder = placeholder;
        this.update({ placeholder });
    }

    get buttons(): theia.QuickInputButton[] {
        return this._buttons;
    }

    set buttons(buttons: theia.QuickInputButton[]) {
        this._buttons = buttons.slice();
        this._handlesToButtons.clear();
        buttons.forEach((button, i) => {
            const handle = button === QuickInputButtons.Back ? -1 : i;
            this._handlesToButtons.set(handle, button);
        });
        this.update({
            buttons: buttons.map<TransferQuickInputButton>((button, i) => ({
                iconUrl: PluginIconPath.toUrl(button.iconPath, this.plugin) ?? ThemeIcon.get(button.iconPath),
                tooltip: button.tooltip,
                handle: button === QuickInputButtons.Back ? -1 : i,
            }))
        });
    }

    show(): void {
        this.visible = true;
        this.expectingHide = true;
        this.update({ visible: true });
    }

    dispose(): void {
        if (this._disposed) {
            return;
        }
        this._disposed = true;
        this._fireHide();
        this.disposableCollection.dispose();
        this._onDidDispose();
        this.quickOpenMain.$dispose(this._id);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected update(properties: Record<string, any>): void {
        if (this._disposed) {
            return;
        }
        for (const key of Object.keys(properties)) {
            const value = properties[key];
            this._pendingUpdate[key] = value === undefined ? null : value;
        }

        if ('visible' in this._pendingUpdate) {
            if (this._updateTimeout) {
                clearTimeout(this._updateTimeout);
                this._updateTimeout = undefined;
            }
            this.dispatchUpdate();
        } else if (this.visible && !this._updateTimeout) {
            // Defer the update so that multiple changes to setters dont cause a redraw each
            this._updateTimeout = setTimeout(() => {
                this._updateTimeout = undefined;
                this.dispatchUpdate();
            }, 0);
        }
    }

    private dispatchUpdate(): void {
        this.quickOpenMain.$createOrUpdate(this._pendingUpdate);
        this._pendingUpdate = { id: this._id };
    }

    hide(): void {
        this.quickOpenMain.$hide();
    }

    protected convertURL(iconPath: URI | { light: string | URI; dark: string | URI } | ThemeIcon):
        URI | { light: string | URI; dark: string | URI } | ThemeIcon {
        const toUrl = (arg: string | URI) => {
            arg = arg instanceof URI && arg.scheme === 'file' ? arg.fsPath : arg;
            if (typeof arg !== 'string') {
                return arg.toString(true);
            }
            const { packagePath } = this.plugin.rawModel;
            const absolutePath = path.isAbsolute(arg) ? arg : path.join(packagePath, arg);
            const normalizedPath = path.normalize(absolutePath);
            const relativePath = path.relative(packagePath, normalizedPath);
            return PluginPackage.toPluginUrl(this.plugin.rawModel, relativePath);
        };
        if (ThemeIcon.is(iconPath)) {
            return iconPath;
        } else if (typeof iconPath === 'string' || iconPath instanceof URI) {
            return URI.parse(toUrl(iconPath));
        } else {
            const { light, dark } = iconPath as { light: string | URI, dark: string | URI };
            return {
                light: toUrl(light),
                dark: toUrl(dark)
            };
        }
    }

    _fireAccept(): void {
        this.onDidAcceptEmitter.fire(undefined);
    }

    _fireChangedValue(changedValue: string): void {
        this._value = changedValue;
        this._onDidChangeValueEmitter.fire(changedValue);
    }

    _fireHide(): void {
        if (this.expectingHide) {
            this.expectingHide = false;
            this.onDidHideEmitter.fire(undefined);
        }
    }

    _fireButtonTrigger(btn: theia.QuickInputButton): void {
        this.onDidTriggerButtonEmitter.fire(btn);
    }

    get onDidHide(): Event<void> {
        return this.onDidHideEmitter.event;
    }

    get onDidAccept(): Event<void> {
        return this.onDidAcceptEmitter.event;
    }

    get onDidChangeValue(): Event<string> {
        return this._onDidChangeValueEmitter.event;
    }

    get onDidTriggerButton(): Event<theia.QuickInputButton> {
        return this.onDidTriggerButtonEmitter.event;
    }
}

/**
 * Base implementation of {@link InputBox} that uses {@link QuickOpenExt}.
 * Missing functionality is going to be implemented in the scope of https://github.com/eclipse-theia/theia/issues/5109
 */
export class InputBoxExt extends QuickInputExt implements theia.InputBox {

    private _password: boolean;
    private _prompt: string | undefined;
    private _valueSelection: readonly [number, number] | undefined;
    private _validationMessage: string | undefined;

    constructor(
        override readonly quickOpen: QuickOpenExtImpl,
        override readonly quickOpenMain: QuickOpenMain,
        override readonly plugin: Plugin,
        onDispose: () => void
    ) {
        super(quickOpen, quickOpenMain, plugin, onDispose);

        this.buttons = [];
        this.password = false;
        this.value = '';
    }

    get password(): boolean {
        return this._password;
    }

    set password(password: boolean) {
        this._password = password;
        this.update({ password });
    }

    get prompt(): string | undefined {
        return this._prompt;
    }

    set prompt(prompt: string | undefined) {
        this._prompt = prompt;
        this.update({ prompt });
    }

    get valueSelection(): readonly [number, number] | undefined {
        return this._valueSelection;
    }

    set valueSelection(valueSelection: readonly [number, number] | undefined) {
        this._valueSelection = valueSelection;
        this.update({ valueSelection });
    }

    get validationMessage(): string | undefined {
        return this._validationMessage;
    }

    set validationMessage(validationMessage: string | undefined) {
        if (this._validationMessage !== validationMessage) {
            this._validationMessage = validationMessage;
            this.update({ validationMessage });
        }
    }
}

/**
 * Base implementation of {@link QuickPick} that uses {@link QuickOpenExt}.
 * Missing functionality is going to be implemented in the scope of https://github.com/eclipse-theia/theia/issues/5059
 */
export class QuickPickExt<T extends theia.QuickPickItem> extends QuickInputExt implements theia.QuickPick<T> {
    private _items: T[] = [];
    private _handlesToItems = new Map<number, T>();
    private _itemsToHandles = new Map<T, number>();
    private _canSelectMany = false;
    private _matchOnDescription = true;
    private _matchOnDetail = true;
    private _sortByLabel = true;
    private _keepScrollPosition = false;
    private _activeItems: T[] = [];
    private _selectedItems: T[] = [];
    private readonly _onDidChangeActiveEmitter = new Emitter<T[]>();
    private readonly _onDidChangeSelectionEmitter = new Emitter<T[]>();
    private readonly _onDidTriggerItemButtonEmitter = new Emitter<theia.QuickPickItemButtonEvent<T>>();

    constructor(
        override readonly quickOpen: QuickOpenExtImpl,
        override readonly quickOpenMain: QuickOpenMain,
        override readonly plugin: Plugin,
        onDispose: () => void
    ) {
        super(quickOpen, quickOpenMain, plugin, onDispose);
        this.buttons = [];

        this.disposableCollection.push(this._onDidChangeActiveEmitter);
        this.disposableCollection.push(this._onDidChangeSelectionEmitter);
        this.disposableCollection.push(this._onDidTriggerItemButtonEmitter);

        this.update({ type: 'quickPick' });
    }

    get items(): T[] {
        return this._items;
    }

    set items(items: T[]) {
        this._items = items.slice();
        this._handlesToItems.clear();
        this._itemsToHandles.clear();
        items.forEach((item, i) => {
            this._handlesToItems.set(i, item);
            this._itemsToHandles.set(item, i);
        });

        const pickItems: TransferQuickPickItem[] = [];
        for (let handle = 0; handle < items.length; handle++) {
            const item = items[handle];
            if (item.kind === QuickPickItemKind.Separator) {
                pickItems.push({ kind: 'separator', label: item.label, handle });
            } else {
                pickItems.push({
                    kind: 'item',
                    label: item.label,
                    iconUrl: PluginIconPath.toUrl(item.iconPath, this.plugin) ?? ThemeIcon.get(item.iconPath),
                    description: item.description,
                    handle,
                    detail: item.detail,
                    picked: item.picked,
                    alwaysShow: item.alwaysShow,
                    buttons: item.buttons?.map<TransferQuickInputButton>((button, index) => ({
                        iconUrl: PluginIconPath.toUrl(button.iconPath, this.plugin) ?? ThemeIcon.get(button.iconPath),
                        tooltip: button.tooltip,
                        handle: button === QuickInputButtons.Back ? -1 : index,
                    }))
                });
            }
        }

        this.update({
            items: pickItems,
        });
    }

    get canSelectMany(): boolean {
        return this._canSelectMany;
    }

    set canSelectMany(canSelectMany: boolean) {
        this._canSelectMany = canSelectMany;
        this.update({ canSelectMany });
    }

    get matchOnDescription(): boolean {
        return this._matchOnDescription;
    }

    set matchOnDescription(matchOnDescription: boolean) {
        this._matchOnDescription = matchOnDescription;
        this.update({ matchOnDescription });
    }

    get matchOnDetail(): boolean {
        return this._matchOnDetail;
    }

    set matchOnDetail(matchOnDetail: boolean) {
        this._matchOnDetail = matchOnDetail;
        this.update({ matchOnDetail });
    }

    get sortByLabel(): boolean {
        return this._sortByLabel;
    }

    set sortByLabel(sortByLabel: boolean) {
        this._sortByLabel = sortByLabel;
        this.update({ sortByLabel });
    }

    get keepScrollPosition(): boolean {
        return this._keepScrollPosition;
    }

    set keepScrollPosition(keepScrollPosition: boolean) {
        this._keepScrollPosition = keepScrollPosition;
        this.update({ keepScrollPosition });
    }

    get activeItems(): T[] {
        return this._activeItems;
    }

    set activeItems(activeItems: T[]) {
        this._activeItems = activeItems.filter(item => this._itemsToHandles.has(item));
        this.update({ activeItems: this._activeItems.map(item => this._itemsToHandles.get(item)) });
    }

    onDidChangeActive = this._onDidChangeActiveEmitter.event;

    get selectedItems(): T[] {
        return this._selectedItems;
    }

    set selectedItems(selectedItems: T[]) {
        this._selectedItems = selectedItems.filter(item => this._itemsToHandles.has(item));
        this.update({ selectedItems: this._selectedItems.map(item => this._itemsToHandles.get(item)) });
    }

    onDidChangeSelection = this._onDidChangeSelectionEmitter.event;

    _fireDidChangeActive(handles: number[]): void {
        const items = handles.map(handle => this._handlesToItems.get(handle)).filter(e => !!e) as T[];
        this._activeItems = items;
        this._onDidChangeActiveEmitter.fire(items);
    }

    _fireDidChangeSelection(handles: number[]): void {
        const items = handles.map(handle => this._handlesToItems.get(handle)).filter(e => !!e) as T[];
        this._selectedItems = items;
        this._onDidChangeSelectionEmitter.fire(items);
    }

    onDidTriggerItemButton = this._onDidTriggerItemButtonEmitter.event;

    _fireDidTriggerItemButton(itemHandle: number, buttonHandle: number): void {
        const item = this._handlesToItems.get(itemHandle)!;
        if (!item || !item.buttons || !item.buttons.length) {
            return;
        }
        const button = item.buttons[buttonHandle];
        if (button) {
            this._onDidTriggerItemButtonEmitter.fire({
                button,
                item
            });
        }
    }
}
