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

import { injectable } from 'inversify';
import { MaybePromise, URI } from '../common';
import { OpenHandler, OpenerOptions } from './opener-service';

export interface UriHandler {
    canHandleURI(uri: URI): boolean;
    handleUri(uri: URI): Promise<boolean>;
}

@injectable()
export class ExtensionOpenHandler implements OpenHandler {

    readonly id = 'extensionsURIHandlers';

    private providers = new Map<string, UriHandler>();

    canHandle(uri: URI, options?: OpenerOptions | undefined): MaybePromise<number> {
        if (!uri.scheme.startsWith('theia')) {
            return 0;
        }

        const authority = uri.authority;
        const handler = this.providers.get(authority);
        if (handler?.canHandleURI(uri)) {
            return 500;
        }
        return 0;
    }

    open(uri: URI, options?: OpenerOptions | undefined): MaybePromise<object | undefined> {
        const authority = uri.authority;
        const provider = this.providers.get(authority);
        if (provider) {
            return provider.handleUri(uri);
        }
        return Promise.reject(`Impossible to handle ${uri}.`);
    }

    public registerHandler(extensionId: string, handler: UriHandler): void {
        this.providers.set(extensionId, handler);
    }

    public unregisterHandler(extensionId: string): void {
        this.providers.delete(extensionId);
    }

}
