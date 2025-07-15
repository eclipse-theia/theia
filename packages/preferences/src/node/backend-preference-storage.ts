// *****************************************************************************
// Copyright (C) 2025 STMicroelectronics and others.
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

import { Listener, ListenerList, URI } from '@theia/core';
import { JSONValue } from '@theia/core/shared/@lumino/coreutils';
import { PreferenceStorage } from '../common/abstract-resource-preference-provider';
import { promises as fs } from 'fs';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { EncodingService } from '@theia/core/lib/common/encoding-service';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { Deferred } from '@theia/core/lib/common/promise-util';
import debounce = require('@theia/core/shared/lodash.debounce');
import { JSONCEditor } from '../common/jsonc-editor';

interface WriteOperation {
    key: string,
    path: string[],
    value: JSONValue
}

export class BackendPreferenceStorage implements PreferenceStorage {

    protected pendingWrites: WriteOperation[] = [];
    protected writeDeferred = new Deferred<boolean>();
    protected writeFile = debounce(() => {
        this.doWrite();
    }, 10);

    protected currentContent: string | undefined = undefined;

    constructor(
        protected readonly uri: URI,
        protected readonly encodingService: EncodingService,
        protected readonly jsonEditor: JSONCEditor) {
    }

    writeValue(key: string, path: string[], value: JSONValue): Promise<boolean> {
        this.pendingWrites.push({
            key, path, value
        });
        return this.waitForWrite();
    }

    waitForWrite(): Promise<boolean> {
        const result = this.writeDeferred.promise;
        this.writeFile();
        return result;
    }

    async doWrite(): Promise<void> {
        try {
            if (this.currentContent === undefined) {
                await this.read();
            }
            let newContent = this.currentContent || '';
            for (const op of this.pendingWrites) {
                newContent = this.jsonEditor.setValue(newContent, op.path, op.value);
            }
            await fs.writeFile(FileUri.fsPath(this.uri), newContent);
            this.currentContent = newContent;
            this.pendingWrites = [];
            await Listener.await(newContent, this.onStoredListeners);
            this.writeDeferred.resolve(true);
        } catch (e) {
            this.currentContent = undefined;
            console.error(e);
            this.writeDeferred.resolve(false);
        } finally {
            this.writeDeferred = new Deferred();
        }
    }

    protected readonly onStoredListeners = new ListenerList<string, Promise<boolean>>();
    onStored: Listener.Registration<string, Promise<boolean>> = this.onStoredListeners.registration;

    async read(): Promise<string> {
        const contents = BinaryBuffer.wrap(await fs.readFile(FileUri.fsPath(this.uri)));
        const encoding = (await this.encodingService.detectEncoding(contents)).encoding;
        this.currentContent = this.encodingService.decode(contents, encoding);
        return this.currentContent;
    }

    dispose(): void {
    }

}
