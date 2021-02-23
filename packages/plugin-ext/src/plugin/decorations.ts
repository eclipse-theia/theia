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
    DecorationProvider,
    DecorationsExt,
    DecorationsMain,
    PLUGIN_RPC_CONTEXT
} from '../common/plugin-api-rpc';
import { Event } from '@theia/core/lib/common/event';
import { RPCProtocol } from '../common/rpc-protocol';
import { URI } from '@theia/core/shared/vscode-uri';
import { Disposable } from './types-impl';

export class DecorationsExtImpl implements DecorationsExt {
    static PROVIDER_ID: number = 0;

    private readonly providersMap: Map<number, DecorationProvider>;
    private readonly proxy: DecorationsMain;

    constructor(readonly rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.DECORATIONS_MAIN);
        this.providersMap = new Map();
    }

    registerDecorationProvider(provider: theia.DecorationProvider): Disposable {
        const id = DecorationsExtImpl.PROVIDER_ID++;
        provider.onDidChangeDecorations(arg => {
            let argument;
            if (Array.isArray(arg)) {
                argument = arg.map(uri => uri.toString());
            } else if (arg) {
                argument = arg.toString();
            }
            this.proxy.$fireDidChangeDecorations(id, argument);
        });
        const providerMain: DecorationProvider = {
            async provideDecoration(uri: string): Promise<DecorationData | undefined> {
                const res = await provider.provideDecoration(URI.parse(uri), new CancellationTokenImpl());
                if (res) {
                    let color;
                    if (res.color) {
                        /* eslint-disable @typescript-eslint/no-explicit-any */
                        const ob: any = res.color;
                        color = { id: ob.id };
                    }
                    return {
                        letter: res.letter,
                        title: res.title,
                        color: color,
                        priority: res.priority,
                        bubble: res.bubble,
                        source: res.source
                    };
                }
            }
        };
        this.proxy.$registerDecorationProvider(id, providerMain);
        this.providersMap.set(id, providerMain);
        return new Disposable(() => {
            this.proxy.$dispose(id);
        });
    }

    async $provideDecoration(id: number, uri: string): Promise<DecorationData | undefined> {
        const provider = this.providersMap.get(id);
        if (provider) {
            return provider.provideDecoration(uri);
        }
    }
}

class CancellationTokenImpl implements theia.CancellationToken {
    readonly isCancellationRequested: boolean;
    readonly onCancellationRequested: Event<any>;
}
