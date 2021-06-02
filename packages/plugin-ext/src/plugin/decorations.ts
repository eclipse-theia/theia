/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import * as theia from '@theia/plugin';
import {
    DecorationData,
    DecorationReply,
    DecorationRequest,
    DecorationsExt,
    DecorationsMain,
    PLUGIN_RPC_CONTEXT, PluginInfo
} from '../common/plugin-api-rpc';
import { RPCProtocol } from '../common/rpc-protocol';
import { URI } from './types-impl';
import { Disposable, FileDecoration } from './types-impl';
import { CancellationToken } from '@theia/core/lib/common';
import { dirname } from 'path';

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// some code copied and modified from https://github.com/microsoft/vscode/blob/1.52.1/src/vs/workbench/api/common/extHostDecorations.ts#L39-L38

interface ProviderData {
    provider: theia.FileDecorationProvider;
    pluginInfo: PluginInfo;
}

export class DecorationsExtImpl implements DecorationsExt {
    private static handle = 0;
    private static maxEventSize = 250;

    private readonly providersMap: Map<number, ProviderData>;
    private readonly proxy: DecorationsMain;

    constructor(readonly rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.DECORATIONS_MAIN);
        this.providersMap = new Map();
    }

    registerFileDecorationProvider(provider: theia.FileDecorationProvider, pluginInfo: PluginInfo): theia.Disposable {
        const handle = DecorationsExtImpl.handle++;
        this.providersMap.set(handle, { provider, pluginInfo });
        this.proxy.$registerDecorationProvider(handle);

        const listener = provider.onDidChangeFileDecorations && provider.onDidChangeFileDecorations(e => {
            if (!e) {
                this.proxy.$onDidChange(handle, null);
                return;
            }
            const array = Array.isArray(e) ? e : [e];
            if (array.length <= DecorationsExtImpl.maxEventSize) {
                this.proxy.$onDidChange(handle, array);
                return;
            }

            // too many resources per event. pick one resource per folder, starting
            // with parent folders
            const mapped = array.map(uri => ({ uri, rank: (uri.path.match(/\//g) || []).length }));
            const groups = groupBy(mapped, (a, b) => a.rank - b.rank);
            const picked: URI[] = [];
            outer: for (const uris of groups) {
                let lastDirname: string | undefined;
                for (const obj of uris) {
                    const myDirname = dirname(obj.uri.path);
                    if (lastDirname !== myDirname) {
                        lastDirname = myDirname;
                        if (picked.push(obj.uri) >= DecorationsExtImpl.maxEventSize) {
                            break outer;
                        }
                    }
                }
            }
            this.proxy.$onDidChange(handle, picked);
        });

        return new Disposable(() => {
            listener?.dispose();
            this.proxy.$unregisterDecorationProvider(handle);
            this.providersMap.delete(handle);
        });

        function groupBy<T>(data: ReadonlyArray<T>, compareFn: (a: T, b: T) => number): T[][] {
            const result: T[][] = [];
            let currentGroup: T[] | undefined = undefined;
            for (const element of data.slice(0).sort(compareFn)) {
                if (!currentGroup || compareFn(currentGroup[0], element) !== 0) {
                    currentGroup = [element];
                    result.push(currentGroup);
                } else {
                    currentGroup.push(element);
                }
            }
            return result;
        }
    }

    async $provideDecorations(handle: number, requests: DecorationRequest[], token: CancellationToken): Promise<DecorationReply> {
        if (!this.providersMap.has(handle)) {
            // might have been unregistered in the meantime
            return Object.create(null);
        }

        const result: DecorationReply = Object.create(null);
        const { provider, pluginInfo } = this.providersMap.get(handle)!;

        await Promise.all(requests.map(async request => {
            try {
                const { uri, id } = request;
                const data = await Promise.resolve(provider.provideFileDecoration(URI.revive(uri), token));
                if (!data) {
                    return;
                }
                try {
                    FileDecoration.validate(data);
                    result[id] = <DecorationData>[data.propagate, data.tooltip, data.badge, data.color];
                } catch (e) {
                    console.warn(`INVALID decoration from extension '${pluginInfo.name}': ${e}`);
                }
            } catch (err) {
                console.error(err);
            }
        }));

        return result;
    }
}
