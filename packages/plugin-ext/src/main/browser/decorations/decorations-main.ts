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
import {
    DecorationData,
    DecorationRequest,
    DecorationsExt,
    DecorationsMain,
    MAIN_RPC_CONTEXT
} from '../../../common/plugin-api-rpc';

import { interfaces } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/lib/common/event';
import { Disposable } from '@theia/core/lib/common/disposable';
import { RPCProtocol } from '../../../common/rpc-protocol';
import { UriComponents } from '../../../common/uri-components';
import { URI as VSCodeURI } from '@theia/core/shared/vscode-uri';
import { CancellationToken } from '@theia/core/lib/common/cancellation';
import URI from '@theia/core/lib/common/uri';
import { Decoration, DecorationsService } from '@theia/core/lib/browser/decorations-service';

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// some code copied and modified from https://github.com/microsoft/vscode/blob/1.52.1/src/vs/workbench/api/browser/mainThreadDecorations.ts#L85

class DecorationRequestsQueue {

    private idPool = 0;
    private requests = new Map<number, DecorationRequest>();
    private resolver = new Map<number, (data: DecorationData) => void>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private timer: any;

    constructor(
        private readonly proxy: DecorationsExt,
        private readonly handle: number
    ) {
    }

    enqueue(uri: URI, token: CancellationToken): Promise<DecorationData> {
        const id = ++this.idPool;
        const result = new Promise<DecorationData>(resolve => {
            this.requests.set(id, { id, uri: VSCodeURI.parse(uri.toString()) });
            this.resolver.set(id, resolve);
            this.processQueue();
        });
        token.onCancellationRequested(() => {
            this.requests.delete(id);
            this.resolver.delete(id);
        });
        return result;
    }

    private processQueue(): void {
        if (typeof this.timer === 'number') {
            // already queued
            return;
        }
        this.timer = setTimeout(() => {
            // make request
            const requests = this.requests;
            const resolver = this.resolver;
            this.proxy.$provideDecorations(this.handle, [...requests.values()], CancellationToken.None).then(data => {
                for (const [id, resolve] of resolver) {
                    resolve(data[id]);
                }
            });

            // reset
            this.requests = new Map();
            this.resolver = new Map();
            this.timer = undefined;
        }, 0);
    }
}

export class DecorationsMainImpl implements DecorationsMain, Disposable {

    private readonly proxy: DecorationsExt;
    private readonly providers = new Map<number, [Emitter<URI[]>, Disposable]>();
    private readonly decorationsService: DecorationsService;

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.DECORATIONS_EXT);
        this.decorationsService = container.get(DecorationsService);
    }

    dispose(): void {
        this.providers.forEach(value => value.forEach(v => v.dispose()));
        this.providers.clear();
    }

    async $registerDecorationProvider(handle: number): Promise<void> {
        const emitter = new Emitter<URI[]>();
        const queue = new DecorationRequestsQueue(this.proxy, handle);
        const registration = this.decorationsService.registerDecorationsProvider({
            onDidChange: emitter.event,
            provideDecorations: async (uri, token) => {
                const data = await queue.enqueue(uri, token);
                if (!data) {
                    return undefined;
                }
                const [bubble, tooltip, letter, themeColor] = data;
                return <Decoration>{
                    weight: 10,
                    bubble: bubble ?? false,
                    colorId: themeColor?.id,
                    tooltip,
                    letter
                };
            }
        });
        this.providers.set(handle, [emitter, registration]);
    }

    $onDidChange(handle: number, resources: UriComponents[]): void {
        const providerSet = this.providers.get(handle);
        if (providerSet) {
            const [emitter] = providerSet;
            emitter.fire(resources && resources.map(r => new URI(VSCodeURI.revive(r).toString())));
        }
    }

    $unregisterDecorationProvider(handle: number): void {
        const provider = this.providers.get(handle);
        if (provider) {
            provider.forEach(p => p.dispose());
            this.providers.delete(handle);
        }
    }
}
