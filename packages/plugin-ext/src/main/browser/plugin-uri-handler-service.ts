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

import { OpenerOptions, OpenerService, OpenHandler } from '@theia/core/lib/browser';
import { injectable, inject } from '@theia/core/shared/inversify';
import { Disposable, MaybePromise, URI } from '@theia/core';

export interface UriHandler {
    canHandleURI(uri: URI): boolean;
    handleUri(uri: URI): Promise<void>;
}

export const PluginUriHandlerService = Symbol('PluginUriHandlerService');

export interface PluginUriHandlerService {
    registerUriHandler(id: string, uriHandler: UriHandler): Disposable;
    unregisterUriHandler?(id: string): void;
}

@injectable()
export class DefaultPluginUriHandlerService implements PluginUriHandlerService {

    @inject(OpenerService) openerService: OpenerService;

    private handlersByAuthority = new Map<string, OpenHandler>();

    registerUriHandler(id: string, uriHandler: UriHandler): Disposable {
        const pluginOpenHandler = new PluginOpenHandler(id, uriHandler);
        this.handlersByAuthority.set(id, pluginOpenHandler);
        const disposable = this.openerService.addHandler?.(pluginOpenHandler);
        if (!disposable) {
            console.log('impossible to register PluginOpenHandler contribution, as OpenerService cannot receive additional handlers.');
            return Disposable.NULL;
        }
        return disposable;
    }

    unregisterUriHandler(id: string): void {
        const pluginOpenHandler = this.handlersByAuthority.get(id);
        if (pluginOpenHandler) {
            this.openerService.removeHandler?.(pluginOpenHandler);
            this.handlersByAuthority.delete(id);
        }
    }
}

export class PluginOpenHandler implements OpenHandler {

    readonly id: string;

    constructor(pluginId: string, private uriHandler: UriHandler) {
        this.id = `plugin-${pluginId}`;
    }

    canHandle(uri: URI, options?: OpenerOptions | undefined): MaybePromise<number> {
        if (!uri.scheme.startsWith('theia')) {
            return 0;
        }

        if (this.uriHandler.canHandleURI(uri)) {
            return 500;
        }
        return 0;
    }

    async open(uri: URI, options?: OpenerOptions | undefined): Promise<undefined> {
        await this.uriHandler.handleUri(uri);
        return undefined;
    }
}
