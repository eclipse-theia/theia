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
import { FileContentStatus, PreferenceStorage } from '../common/abstract-resource-preference-provider';
import { EncodingService } from '@theia/core/lib/common/encoding-service';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { Deferred } from '@theia/core/lib/common/promise-util';
import debounce = require('@theia/core/shared/lodash.debounce');
import { JSONCEditor } from '../common/jsonc-editor';
import { DiskFileSystemProvider } from '@theia/filesystem/lib/node/disk-file-system-provider';
import { UTF8 } from '@theia/core/lib/common/encodings';

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
    protected encoding: string = UTF8;

    constructor(
        protected readonly fileSystem: DiskFileSystemProvider,
        protected readonly uri: URI,
        protected readonly encodingService: EncodingService,
        protected readonly jsonEditor: JSONCEditor) {

        this.fileSystem.watch(uri, { excludes: [], recursive: false });
        this.fileSystem.onDidChangeFile(events => {
            for (const e of events) {
                if (e.resource.isEqual(uri)) {
                    this.read().then(content => this.onDidChangeFileContentListeners.invoke({ content, fileOK: true }, () => { }))
                        .catch(() => this.onDidChangeFileContentListeners.invoke({ content: '', fileOK: false }, () => { }));
                }
            }
        });
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
            await this.fileSystem.writeFile(this.uri, this.encodingService.encode(newContent, {
                encoding: this.encoding,
                hasBOM: false
            }).buffer, {
                create: true,
                overwrite: true
            });
            this.currentContent = newContent;
            this.pendingWrites = [];
            await Listener.awaitAll({ content: newContent, fileOK: true }, this.onDidChangeFileContentListeners);
            this.writeDeferred.resolve(true);
        } catch (e) {
            this.currentContent = undefined;
            console.error(e);
            this.writeDeferred.resolve(false);
        } finally {
            this.writeDeferred = new Deferred();
        }
    }

    protected readonly onDidChangeFileContentListeners = new ListenerList<FileContentStatus, Promise<boolean>>();
    onDidChangeFileContent: Listener.Registration<FileContentStatus, Promise<boolean>> = this.onDidChangeFileContentListeners.registration;

    async read(): Promise<string> {
        const contents = BinaryBuffer.wrap(await this.fileSystem.readFile(this.uri));
        this.encoding = (await this.encodingService.detectEncoding(contents)).encoding || this.encoding;
        this.currentContent = this.encodingService.decode(contents, this.encoding);
        return this.currentContent;
    }

    dispose(): void {
    }

}
