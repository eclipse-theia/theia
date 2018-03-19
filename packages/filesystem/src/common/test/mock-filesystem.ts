/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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

    setClient(client: FileSystemClient) {

    }
}
