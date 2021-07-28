/********************************************************************************
 * Copyright (C) 2021 Red Hat, Inc. and others.
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// code copied and modified from https://github.com/microsoft/vscode/blob/1.55.2/src/vs/platform/native/electron-main/nativeHostMainService.ts#L679-L771

import { KeytarService } from '../common/keytar-protocol';
import { injectable } from 'inversify';
import { isWindows } from '../common';
import * as keytar from 'keytar';

@injectable()
export class KeytarServiceImpl implements KeytarService {
    private static readonly MAX_PASSWORD_LENGTH = 2500;
    private static readonly PASSWORD_CHUNK_SIZE = KeytarServiceImpl.MAX_PASSWORD_LENGTH - 100;

    async setPassword(service: string, account: string, password: string): Promise<void> {
        if (isWindows && password.length > KeytarServiceImpl.MAX_PASSWORD_LENGTH) {
            let index = 0;
            let chunk = 0;
            let hasNextChunk = true;
            while (hasNextChunk) {
                const passwordChunk = password.substring(index, index + KeytarServiceImpl.PASSWORD_CHUNK_SIZE);
                index += KeytarServiceImpl.PASSWORD_CHUNK_SIZE;
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

    deletePassword(service: string, account: string): Promise<boolean> {
        return keytar.deletePassword(service, account);
    }

    async getPassword(service: string, account: string): Promise<string | undefined> {
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
        const password = await keytar.findPassword(service);
        if (password) {
            return password;
        }
    }
    async findCredentials(service: string): Promise<Array<{ account: string, password: string }>> {
        return keytar.findCredentials(service);
    }
}

interface ChunkedPassword {
    content: string;
    hasNextChunk: boolean;
}
