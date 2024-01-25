// *****************************************************************************
// Copyright (C) 2024 STMicroelectronics.
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

import { Disposable, MaybePromise, URI } from '@theia/core';
import { MAIN_RPC_CONTEXT, UriExt, UriMain } from '../../common';
import { RPCProtocol } from '../../common/rpc-protocol';
import { interfaces } from '@theia/core/shared/inversify';
import { OpenHandler, OpenerOptions, OpenerService } from '@theia/core/lib/browser';

export class UriMainImpl implements UriMain, Disposable {

    private readonly proxy: UriExt;
    private handlers = new Map<number, OpenHandler>();
    private readonly openerService: OpenerService;

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.URI_EXT);
        this.openerService = container.get(OpenerService);
    }

    dispose(): void {
        this.handlers.forEach(handler => this.openerService.removeHandler?.(handler));
        this.handlers.clear();
    }

    async $registerUriHandler(handle: number, extensionId: string, extensionDisplayName: string): Promise<void> {
        const extensionUriHandler = new PluginOpenHandler(this.proxy, handle, extensionId, extensionDisplayName);
        if (this.openerService.addHandler?.(extensionUriHandler)) {
            this.handlers.set(handle, extensionUriHandler);
        }
        return Promise.resolve();
    }

    async $unregisterUriHandler(handle: number):  Promise<void> {
        const handler = this.handlers.get(handle);
        if (handler) {
            this.handlers.delete(handle);
            this.openerService.removeHandler?.(handler);
        }
    }
}

export class PluginOpenHandler implements OpenHandler {

    readonly id: string;

    constructor(private proxy: UriExt, private handle: number, private pluginId: string, private pluginName: string) {
        this.id = `plugin-${pluginId}`;
    }

    canHandle(uri: URI, options?: OpenerOptions | undefined): MaybePromise<number> {
        if (!uri.scheme.startsWith('theia')) {
            return 0;
        }

        if (uri.authority === this.pluginId) {
            return 500;
        }
        return 0;
    }

    async open(uri: URI, options?: OpenerOptions | undefined): Promise<undefined> {
        if (this.canHandle(uri) === 0) {
            throw new Error(`Extension ${this.pluginName} is not supposed to handle this URI: ${uri}`);
        }
        await Promise.resolve(this.proxy.$handleExternalUri(this.handle, uri.toComponents()));
        return undefined;
    }
}
