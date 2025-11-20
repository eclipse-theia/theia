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

import { ListenerList, DisposableCollection, URI, PreferenceScope, Listener } from '@theia/core';
import { JSONValue } from '@theia/core/shared/@lumino/coreutils';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileContentStatus, PreferenceStorage } from '../common/abstract-resource-preference-provider';
import { PreferenceTransaction, PreferenceTransactionFactory } from './preference-transaction-manager';

export class FrontendPreferenceStorage implements PreferenceStorage {

    protected readonly onDidChangeFileContentListeners = new ListenerList<FileContentStatus, Promise<boolean>>();
    protected transaction: PreferenceTransaction | undefined;

    protected readonly toDispose = new DisposableCollection();

    constructor(
        protected readonly transactionFactory: PreferenceTransactionFactory,
        protected readonly fileService: FileService,
        protected readonly uri: URI,
        protected readonly scope: PreferenceScope
    ) {

        this.fileService.watch(uri);
        this.fileService.onDidFilesChange(e => {
            if (e.contains(uri)) {
                this.read().then(content => this.onDidChangeFileContentListeners.invoke({ content, fileOK: true }, () => { }))
                    .catch(() => this.onDidChangeFileContentListeners.invoke({ content: '', fileOK: false }, () => { }));
            }
        });
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    writeValue(key: string, path: string[], value: JSONValue): Promise<boolean> {
        if (!this.transaction?.open) {
            const current = this.transaction;
            this.transaction = this.transactionFactory({
                getScope: () => this.scope,
                getConfigUri: () => this.uri
            }, current?.result);
            this.transaction.onWillConclude(async status => {
                if (status) {
                    const content = await this.read();
                    await Listener.awaitAll({ content, fileOK: true }, this.onDidChangeFileContentListeners);
                }
            });
            this.toDispose.push(this.transaction);
        }
        return this.transaction.enqueueAction(key, path, value);
    }

    onDidChangeFileContent: Listener.Registration<FileContentStatus, Promise<boolean>> = this.onDidChangeFileContentListeners.registration;
    async read(): Promise<string> {
        return (await this.fileService.read(this.uri)).value;
    }
}
