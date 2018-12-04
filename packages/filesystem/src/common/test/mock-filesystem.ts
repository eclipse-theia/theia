/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
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

import { injectable } from 'inversify';
import { FileSystem, FileStat, FileSystemClient } from '../filesystem';

const mockFileStat = {
    uri: '',
    lastModification: 0,
    isDirectory: true,
};

@injectable()
export class MockFilesystem implements FileSystem {

    dispose() { }

    getFileStat(uri: string): Promise<FileStat> {
        return Promise.resolve(mockFileStat);
    }

    exists(uri: string): Promise<boolean> {
        return Promise.resolve(true);

    }

    resolveContent(uri: string, options?: { encoding?: string }): Promise<{ stat: FileStat, content: string }> {
        return Promise.resolve({ stat: mockFileStat, content: '' });
    }

    setContent(file: FileStat, content: string, options?: { encoding?: string }): Promise<FileStat> {
        return Promise.resolve(mockFileStat);
    }

    updateContent(): Promise<FileStat> {
        return Promise.resolve(mockFileStat);
    }

    move(sourceUri: string, targetUri: string, options?: { overwrite?: boolean }): Promise<FileStat> {
        return Promise.resolve(mockFileStat);
    }

    copy(sourceUri: string, targetUri: string, options?: { overwrite?: boolean, recursive?: boolean }): Promise<FileStat> {
        return Promise.resolve(mockFileStat);
    }

    createFile(uri: string, options?: { content?: string, encoding?: string }): Promise<FileStat> {
        return Promise.resolve(mockFileStat);
    }

    createFolder(uri: string): Promise<FileStat> {
        return Promise.resolve(mockFileStat);
    }

    touchFile(uri: string): Promise<FileStat> {
        return Promise.resolve(mockFileStat);
    }

    delete(uri: string, options?: { moveToTrash?: boolean }): Promise<void> {
        return Promise.resolve();
    }

    getEncoding(uri: string): Promise<string> {
        return Promise.resolve('');
    }

    getRoots(): Promise<FileStat[]> {
        return Promise.resolve([mockFileStat]);
    }

    getCurrentUserHome(): Promise<FileStat> {
        return Promise.resolve(mockFileStat);
    }

    async access(uri: string, mode?: number): Promise<boolean> {
        return true;
    }

    setClient(client: FileSystemClient) {

    }

    async getDrives(): Promise<string[]> {
        return [];
    }

    async getFsPath(uri: string): Promise<string | undefined> {
        return undefined;
    }
}
