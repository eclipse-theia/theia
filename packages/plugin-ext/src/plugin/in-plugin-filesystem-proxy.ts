/********************************************************************************
 * Copyright (C) 2020 Red Hat, Inc. and others.
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

import * as theia from '@theia/plugin';
import { TextEncoder, TextDecoder } from 'util';
import { FileSystemMain } from '../common/plugin-api-rpc';
import { UriComponents } from '../common/uri-components';
import { FileSystemError, FileType } from './types-impl';
import { FileStat, Uri } from '@theia/plugin';

/**
 * This class is managing FileSystem proxy
 */
export class InPluginFileSystemProxy implements theia.FileSystem {

    private proxy: FileSystemMain;

    constructor(proxy: FileSystemMain) {
        this.proxy = proxy;
    }

    async stat(uri: Uri): Promise<FileStat> {
        try {
            return this.proxy.$stat(uri);
        } catch (error) {
            throw this.handleError(error);
        }
    }
    async readDirectory(uri: UriComponents): Promise<[string, FileType][]> {
        try {
            return this.proxy.$readDirectory(uri);
        } catch (error) {
            throw this.handleError(error);
        }
    }
    async createDirectory(uri: Uri): Promise<void> {
        try {
            return this.proxy.$createDirectory(uri);
        } catch (error) {
            throw this.handleError(error);
        }

    }
    async readFile(uri: UriComponents): Promise<Uint8Array> {
        try {
            const val = await this.proxy.$readFile(uri);
            return new TextEncoder().encode(val);
        } catch (error) {
            throw this.handleError(error);
        }
    }
    async writeFile(uri: UriComponents, content: Uint8Array): Promise<void> {
        const encoded = new TextDecoder().decode(content);

        try {
            return this.proxy.$writeFile(uri, encoded);
        } catch (error) {
            throw this.handleError(error);
        }
    }
    async delete(uri: Uri, options?: { recursive?: boolean, useTrash?: boolean }): Promise<void> {
        try {
            return this.proxy.$delete(uri, { ...{ recursive: false }, ...options });
        } catch (error) {
            throw this.handleError(error);
        }
    }
    async rename(source: Uri, target: Uri, options?: { overwrite?: boolean }): Promise<void> {
        try {
            return this.proxy.$rename(source, target, { ...{ overwrite: false }, ...options });
        } catch (error) {
            throw this.handleError(error);
        }
    }
    async copy(source: Uri, target: Uri, options?: { overwrite?: boolean }): Promise<void> {
        try {
            return this.proxy.$copy(source, target, { ...{ overwrite: false }, ...options });
        } catch (error) {
            throw this.handleError(error);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handleError(error: any): Error {
        if (!(error instanceof Error)) {
            return new FileSystemError(String(error));
        }

        // file system error
        return new FileSystemError(error.message, error.name);
    }

}
