// *****************************************************************************
// Copyright (C) 2021 Red Hat, Inc. and others.
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// code copied and modified from https://github.com/microsoft/vscode/blob/1.55.2/src/vs/platform/native/electron-main/nativeHostMainService.ts#L679-L771

import { KeyStoreService } from '../common/key-store';
import { injectable } from 'inversify';
import { isWindows } from '../common';

@injectable()
export class KeyStoreServiceImpl implements KeyStoreService {

    private static readonly MAX_PASSWORD_LENGTH = 2500;
    private static readonly PASSWORD_CHUNK_SIZE = KeyStoreServiceImpl.MAX_PASSWORD_LENGTH - 100;

    protected keytarImplementation?: typeof import('keytar');

    async setPassword(service: string, account: string, password: string): Promise<void> {
        const keytar = await this.getKeytar();
        if (isWindows && password.length > KeyStoreServiceImpl.MAX_PASSWORD_LENGTH) {
            let index = 0;
            let chunk = 0;
            let hasNextChunk = true;
            while (hasNextChunk) {
                const passwordChunk = password.substring(index, index + KeyStoreServiceImpl.PASSWORD_CHUNK_SIZE);
                index += KeyStoreServiceImpl.PASSWORD_CHUNK_SIZE;
                hasNextChunk = password.length - index > 0;

                const content: ChunkedPassword = {
                    content: passwordChunk,
                    hasNextChunk: hasNextChunk
                };

                await keytar.setPassword(service, chunk ? `${account}-${chunk}` : account, JSON.stringify(content));
                chunk++;
            }

        } else {
            await keytar.setPassword(service, account, password);
        }
    }

    async deletePassword(service: string, account: string): Promise<boolean> {
        const keytar = await this.getKeytar();
        return keytar.deletePassword(service, account);
    }

    async getPassword(service: string, account: string): Promise<string | undefined> {
        const keytar = await this.getKeytar();
        const password = await keytar.getPassword(service, account);
        if (password) {
            try {
                let { content, hasNextChunk }: ChunkedPassword = JSON.parse(password);
                if (!content || !hasNextChunk) {
                    return password;
                }

                let index = 1;
                while (hasNextChunk) {
                    const nextChunk = await keytar.getPassword(service, `${account}-${index++}`);
                    const result: ChunkedPassword = JSON.parse(nextChunk!);
                    content += result.content;
                    hasNextChunk = result.hasNextChunk;
                }

                return content;
            } catch {
                return password;
            }
        }
    }

    async findPassword(service: string): Promise<string | undefined> {
        const keytar = await this.getKeytar();
        const password = await keytar.findPassword(service);
        return password ?? undefined;
    }

    async findCredentials(service: string): Promise<Array<{ account: string, password: string }>> {
        const keytar = await this.getKeytar();
        return keytar.findCredentials(service);
    }

    protected async getKeytar(): Promise<typeof import('keytar')> {
        if (this.keytarImplementation) {
            return this.keytarImplementation;
        }
        try {
            this.keytarImplementation = await import('keytar');
            // Try using keytar to see if it throws or not.
            await this.keytarImplementation.findCredentials('test-keytar-loads');
        } catch (err) {
            this.keytarImplementation = new InMemoryCredentialsProvider();
            console.warn('OS level credential store could not be accessed. Using in-memory credentials provider', err);
        }
        return this.keytarImplementation;
    }
}

export class InMemoryCredentialsProvider {
    private secretVault: Record<string, Record<string, string> | undefined> = {};

    async getPassword(service: string, account: string): Promise<string | null> {
        // eslint-disable-next-line no-null/no-null
        return this.secretVault[service]?.[account] ?? null;
    }

    async setPassword(service: string, account: string, password: string): Promise<void> {
        this.secretVault[service] = this.secretVault[service] ?? {};
        this.secretVault[service]![account] = password;
    }

    async deletePassword(service: string, account: string): Promise<boolean> {
        if (!this.secretVault[service]?.[account]) {
            return false;
        }
        delete this.secretVault[service]![account];
        if (Object.keys(this.secretVault[service]!).length === 0) {
            delete this.secretVault[service];
        }
        return true;
    }

    async findPassword(service: string): Promise<string | null> {
        // eslint-disable-next-line no-null/no-null
        return JSON.stringify(this.secretVault[service]) ?? null;
    }

    async findCredentials(service: string): Promise<Array<{ account: string; password: string }>> {
        const credentials: { account: string; password: string }[] = [];
        for (const account of Object.keys(this.secretVault[service] || {})) {
            credentials.push({ account, password: this.secretVault[service]![account] });
        }
        return credentials;
    }

    async clear(): Promise<void> {
        this.secretVault = {};
    }
}

interface ChunkedPassword {
    content: string;
    hasNextChunk: boolean;
}
