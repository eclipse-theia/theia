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

import { Disposable, URI } from '@theia/core';
import { ExtensionOpenHandler, UriHandler} from '@theia/core/lib/browser/extension-open-handler';
import { MAIN_RPC_CONTEXT, UriExt, UriMain } from '../../common';
import { RPCProtocol } from '../../common/rpc-protocol';
import { interfaces } from '@theia/core/shared/inversify';

export class UriMainImpl implements UriMain, Disposable {

    private readonly proxy: UriExt;
    private readonly handlers = new Map<number, string>();
    private readonly extensionOpenHandler: ExtensionOpenHandler;

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.URI_EXT);
        this.extensionOpenHandler = container.get(ExtensionOpenHandler);
    }

    dispose(): void {
        this.handlers.clear();
    }

    async $registerUriHandler(handle: number, extensionId: string, extensionDisplayName: string): Promise<void> {
        const extensionUrlHandler = new ExtensionUriHandler(this.proxy, handle, extensionId, extensionDisplayName);
        this.extensionOpenHandler.registerHandler(extensionId, extensionUrlHandler);
        this.handlers.set(handle, extensionId);

        return Promise.resolve(undefined);
    }

    async $unregisterUriHandler(handle: number):  Promise<void> {
        const extensionId = this.handlers.get(handle);
        if (extensionId) {
            this.handlers.delete(handle);
            this.extensionOpenHandler.unregisterHandler(extensionId);
        }
    }

}

class ExtensionUriHandler implements UriHandler {

    constructor(
        private proxy: UriExt,
        private readonly handle: number,
        readonly extensionId: string,
        readonly extensionDisplayName: string
    ) { }

    canHandleURI(uri: URI): boolean {
        return uri.authority === this.extensionId;
    }

    handleUri(uri: URI): Promise<boolean> {
        if (this.extensionId !== uri.authority) {
            return Promise.resolve(false);
        }

        return Promise.resolve(this.proxy.$handleExternalUri(this.handle, uri.toComponents())).then(() => true);
    }
}
