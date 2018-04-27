/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { QuickOpenExt, PLUGIN_RPC_CONTEXT as Ext, QuickOpenMain, PickOpenItem } from '../api/plugin-api';
import { QuickPickOptions, QuickPickItem } from '@theia/plugin';
import { CancellationToken } from '@theia/core/lib/common/cancellation';
import { RPCProtocol } from '../api/rpc-protocol';
import { ExtendedPromise } from '../api/extended-promise';
import { hookCancellationToken } from '../api/async-util';

export type Item = string | QuickPickItem;

export class QuickOpenExtImpl implements QuickOpenExt {
    private proxy: QuickOpenMain;
    private selectItemHandler: undefined | ((handle: number) => void);
    private validateInputHandler: undefined | ((input: string) => string | PromiseLike<string>);

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(Ext.QUICK_OPEN_MAIN);
    }
    $onItemSelected(handle: number): void {
        if (this.selectItemHandler) {
            this.selectItemHandler(handle);
        }
    }
    $validateInput(input: string): PromiseLike<string> | undefined {
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
            matchOnDescription: options && options.machOnDescription,
            matchOnDetail: options && options.machOnDetail,
            ignoreFocusLost: options && options.ignoreFocusOut
        });

        const promise = ExtendedPromise.any(<PromiseLike<number | Item[]>[]>[widgetPromise, itemPromise]).then(values => {
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
}
