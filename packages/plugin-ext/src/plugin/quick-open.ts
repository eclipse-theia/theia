/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
import { QuickOpenExt, PLUGIN_RPC_CONTEXT as Ext, QuickOpenMain, PickOpenItem } from '../api/plugin-api';
import { QuickPickOptions, QuickPickItem, InputBoxOptions } from '@theia/plugin';
import { CancellationToken } from '@theia/core/lib/common/cancellation';
import { RPCProtocol } from '../api/rpc-protocol';
import { anyPromise } from '../api/async-util';
import { hookCancellationToken } from '../api/async-util';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { QuickPick, QuickInputButton } from '@theia/plugin';
import { DisposableCollection } from '@theia/core/lib/common/disposable';

export type Item = string | QuickPickItem;

export class QuickOpenExtImpl implements QuickOpenExt {
    private proxy: QuickOpenMain;
    private selectItemHandler: undefined | ((handle: number) => void);
    private validateInputHandler: undefined | ((input: string) => string | PromiseLike<string | undefined> | undefined);

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(Ext.QUICK_OPEN_MAIN);
    }
    $onItemSelected(handle: number): void {
        if (this.selectItemHandler) {
            this.selectItemHandler(handle);
        }
    }
    $validateInput(input: string): PromiseLike<string | undefined> | undefined {
        if (this.validateInputHandler) {
            return Promise.resolve(this.validateInputHandler(input));
        }
        return undefined;
    }

    showQuickPick(promiseOrItems: QuickPickItem[] | PromiseLike<QuickPickItem[]>, options?: QuickPickOptions, token?: CancellationToken): PromiseLike<QuickPickItem | undefined>;
    // tslint:disable-next-line:max-line-length
    showQuickPick(promiseOrItems: QuickPickItem[] | PromiseLike<QuickPickItem[]>, options?: QuickPickOptions & { canSelectMany: true; }, token?: CancellationToken): PromiseLike<QuickPickItem[] | undefined>;
    showQuickPick(promiseOrItems: string[] | PromiseLike<string[]>, options?: QuickPickOptions, token?: CancellationToken): PromiseLike<string | undefined>;
    // tslint:disable-next-line:max-line-length
    showQuickPick(promiseOrItems: Item[] | PromiseLike<Item[]>, options?: QuickPickOptions, token: CancellationToken = CancellationToken.None): PromiseLike<Item | Item[] | undefined> {
        this.selectItemHandler = undefined;
        const itemPromise = Promise.resolve(promiseOrItems);
        const widgetPromise = this.proxy.$show({
            canSelectMany: options && options.canPickMany,
            placeHolder: options && options.placeHolder,
            autoFocus: { autoFocusFirstEntry: true },
            matchOnDescription: options && options.matchOnDescription,
            matchOnDetail: options && options.matchOnDetail,
            ignoreFocusLost: options && options.ignoreFocusOut
        });

        const promise = anyPromise(<PromiseLike<number | Item[]>[]>[widgetPromise, itemPromise]).then(values => {
            if (values.key === 0) {
                return undefined;
            }
            return itemPromise.then(items => {
                const pickItems: PickOpenItem[] = [];
                for (let handle = 0; handle < items.length; handle++) {
                    const item = items[handle];
                    let label: string;
                    let description: string | undefined;
                    let detail: string | undefined;
                    let picked: boolean | undefined;
                    if (typeof item === 'string') {
                        label = item;
                    } else {
                        ({ label, description, detail, picked } = item);
                    }
                    pickItems.push({
                        label,
                        description,
                        handle,
                        detail,
                        picked
                    });
                }

                if (options && typeof options.onDidSelectItem === 'function') {
                    this.selectItemHandler = handle => {
                        options.onDidSelectItem!(items[handle]);
                    };
                }

                this.proxy.$setItems(pickItems);

                return widgetPromise.then(handle => {
                    if (typeof handle === 'number') {
                        return items[handle];
                    } else if (Array.isArray(handle)) {
                        return handle.map(h => items[h]);
                    }
                    return undefined;
                });
            }, err => {
                this.proxy.$setError(err);
                return Promise.reject(err);
            });
        });
        return hookCancellationToken<Item | Item[] | undefined>(token, promise);
    }

    createQuickPick<T extends QuickPickItem>(): QuickPick<T> {
        return new QuickPickExt(this);
    }

    showInput(options?: InputBoxOptions, token: CancellationToken = CancellationToken.None): PromiseLike<string | undefined> {
        this.validateInputHandler = options && options.validateInput;

        if (!options) {
            options = {
                placeHolder: ''
            };
        }

        const promise = this.proxy.$input(options, typeof this.validateInputHandler === 'function');
        return hookCancellationToken(token, promise);
    }

}

/**
 * Base implementation of {@link QuickPick} that uses {@link QuickOpenExt}.
 * Missing functionality is going to be implemented in the scope of https://github.com/theia-ide/theia/issues/5059
 */
export class QuickPickExt<T extends QuickPickItem> implements QuickPick<T> {

    busy: boolean;
    buttons: ReadonlyArray<QuickInputButton>;
    canSelectMany: boolean;
    enabled: boolean;
    ignoreFocusOut: boolean;
    matchOnDescription: boolean;
    matchOnDetail: boolean;
    selectedItems: ReadonlyArray<T>;
    step: number | undefined;
    title: string | undefined;
    totalSteps: number | undefined;
    value: string;

    private _items: T[];
    private _activeItems: T[];
    private _placeholder: string | undefined;
    private disposableCollection: DisposableCollection;
    private readonly onDidHideEmitter: Emitter<void>;
    private readonly onDidAcceptEmitter: Emitter<void>;
    private readonly onDidChangeActiveEmitter: Emitter<T[]>;
    private readonly onDidChangeSelectionEmitter: Emitter<T[]>;
    private readonly onDidChangeValueEmitter: Emitter<string>;
    private readonly onDidTriggerButtonEmitter: Emitter<QuickInputButton>;

    constructor(readonly quickOpen: QuickOpenExtImpl) {
        this._items = [];
        this._activeItems = [];
        this._placeholder = '';
        this.buttons = [];
        this.step = 0;
        this.title = '';
        this.totalSteps = 0;
        this.value = '';
        this.disposableCollection = new DisposableCollection();
        this.disposableCollection.push(this.onDidHideEmitter = new Emitter());
        this.disposableCollection.push(this.onDidAcceptEmitter = new Emitter());
        this.disposableCollection.push(this.onDidChangeActiveEmitter = new Emitter());
        this.disposableCollection.push(this.onDidChangeSelectionEmitter = new Emitter());
        this.disposableCollection.push(this.onDidChangeValueEmitter = new Emitter());
        this.disposableCollection.push(this.onDidTriggerButtonEmitter = new Emitter());
    }

    get items(): T[] {
        return this._items;
    }

    set items(activeItems: T[]) {
        this._items = activeItems;
    }

    get activeItems(): T[] {
        return this._activeItems;
    }

    set activeItems(activeItems: T[]) {
        this._activeItems = activeItems;
    }

    get onDidAccept(): Event<void> {
        return this.onDidAcceptEmitter.event;
    }

    get placeholder(): string | undefined {
        return this._placeholder;
    }
    set placeholder(placeholder: string | undefined) {
        this._placeholder = placeholder;
    }

    get onDidChangeActive(): Event<T[]> {
        return this.onDidChangeActiveEmitter.event;
    }

    get onDidChangeSelection(): Event<T[]> {
        return this.onDidChangeSelectionEmitter.event;
    }

    get onDidChangeValue(): Event<string> {
        return this.onDidChangeValueEmitter.event;
    }

    get onDidTriggerButton(): Event<QuickInputButton> {
        return this.onDidTriggerButtonEmitter.event;
    }

    get onDidHide(): Event<void> {
        return this.onDidHideEmitter.event;
    }

    dispose(): void {
        this.disposableCollection.dispose();
    }

    hide(): void {
        this.dispose();
    }

    show(): void {
        const hide = () => {
            this.onDidHideEmitter.fire(undefined);
        };
        const selectItem = (item: T) => {
            this.activeItems = [item];
            this.onDidAcceptEmitter.fire(undefined);
            this.onDidChangeSelectionEmitter.fire([item]);
        };
        this.quickOpen.showQuickPick(this.items.map(item => item as T), {
            // tslint:disable-next-line:no-any
            onDidSelectItem(item: T | string): any {
                if (typeof item !== 'string') {
                    selectItem(item);
                }
                hide();
            }, placeHolder: this.placeholder
        });
    }

}
