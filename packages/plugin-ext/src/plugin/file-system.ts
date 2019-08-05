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

import URI from 'vscode-uri';
import * as theia from '@theia/plugin';
import { PLUGIN_RPC_CONTEXT, FileSystemExt, FileSystemMain } from '../common/plugin-api-rpc';
import { RPCProtocol } from '../common/rpc-protocol';
import { UriComponents, Schemes } from '../common/uri-components';
import { Disposable } from './types-impl';

export class FileSystemExtImpl implements FileSystemExt {

    private readonly proxy: FileSystemMain;
    private readonly usedSchemes = new Set<string>();
    private readonly fsProviders = new Map<number, theia.FileSystemProvider>();

    private handlePool: number = 0;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.FILE_SYSTEM_MAIN);
        this.usedSchemes.add(Schemes.FILE);
        this.usedSchemes.add(Schemes.UNTITLED);
        this.usedSchemes.add(Schemes.VSCODE);
        this.usedSchemes.add(Schemes.IN_MEMORY);
        this.usedSchemes.add(Schemes.INTERNAL);
        this.usedSchemes.add(Schemes.HTTP);
        this.usedSchemes.add(Schemes.HTTPS);
        this.usedSchemes.add(Schemes.MAILTO);
        this.usedSchemes.add(Schemes.DATA);
        this.usedSchemes.add(Schemes.COMMAND);
    }

    registerFileSystemProvider(scheme: string, provider: theia.FileSystemProvider): theia.Disposable {
        if (this.usedSchemes.has(scheme)) {
            throw new Error(`A provider for the scheme '${scheme}' is already registered`);
        }

        const handle = this.handlePool++;
        this.usedSchemes.add(scheme);
        this.fsProviders.set(handle, provider);

        this.proxy.$registerFileSystemProvider(handle, scheme);

        return new Disposable(() => {
            this.usedSchemes.delete(scheme);
            this.fsProviders.delete(handle);
            this.proxy.$unregisterProvider(handle);
        });
    }

    private checkProviderExists(handle: number): void {
        if (!this.fsProviders.has(handle)) {
            const err = new Error();
            err.name = 'ENOPRO';
            err.message = 'no provider';
            throw err;
        }
    }

    // forwarding calls

    $readFile(handle: number, resource: UriComponents, options?: { encoding?: string }): Promise<string> {
        this.checkProviderExists(handle);

        return Promise.resolve(this.fsProviders.get(handle)!.readFile(URI.revive(resource))).then(data => {
            const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
            const encoding = options === null ? undefined : options && options.encoding;
            return buffer.toString(encoding);
        }
        );
    }

    $writeFile(handle: number, resource: UriComponents, content: string, options?: { encoding?: string }): Promise<void> {
        this.checkProviderExists(handle);

        const uri = URI.revive(resource);
        const encoding = options === null ? undefined : options && options.encoding;
        const buffer = Buffer.from(content, encoding);
        const opts = { create: true, overwrite: true };
        return Promise.resolve(this.fsProviders.get(handle)!.writeFile(uri, buffer, opts));
    }
}
