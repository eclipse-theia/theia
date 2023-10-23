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
// code copied and modified from https://github.com/microsoft/vscode/blob/1.55.2/src/vs/workbench/services/credentials/common/credentials.ts#L12

import { inject, injectable } from 'inversify';
import { Emitter, Event } from '../common/event';
import { KeyStoreService } from '../common/key-store';

export interface CredentialsProvider {
    getPassword(service: string, account: string): Promise<string | undefined>;
    setPassword(service: string, account: string, password: string): Promise<void>;
    deletePassword(service: string, account: string): Promise<boolean>;
    findPassword(service: string): Promise<string | undefined>;
    findCredentials(service: string): Promise<Array<{ account: string, password: string }>>;
}

export const CredentialsService = Symbol('CredentialsService');

export interface CredentialsService extends CredentialsProvider {
    readonly onDidChangePassword: Event<CredentialsChangeEvent>;
}

export interface CredentialsChangeEvent {
    service: string
    account: string;
}

@injectable()
export class CredentialsServiceImpl implements CredentialsService {
    private onDidChangePasswordEmitter = new Emitter<CredentialsChangeEvent>();
    readonly onDidChangePassword = this.onDidChangePasswordEmitter.event;

    private credentialsProvider: CredentialsProvider;

    constructor(@inject(KeyStoreService) private readonly keytarService: KeyStoreService) {
        this.credentialsProvider = new KeytarCredentialsProvider(this.keytarService);
    }

    getPassword(service: string, account: string): Promise<string | undefined> {
        return this.credentialsProvider.getPassword(service, account);
    }

    async setPassword(service: string, account: string, password: string): Promise<void> {
        await this.credentialsProvider.setPassword(service, account, password);

        this.onDidChangePasswordEmitter.fire({ service, account });
    }

    deletePassword(service: string, account: string): Promise<boolean> {
        const didDelete = this.credentialsProvider.deletePassword(service, account);
        this.onDidChangePasswordEmitter.fire({ service, account });

        return didDelete;
    }

    findPassword(service: string): Promise<string | undefined> {
        return this.credentialsProvider.findPassword(service);
    }

    findCredentials(service: string): Promise<Array<{ account: string, password: string; }>> {
        return this.credentialsProvider.findCredentials(service);
    }
}

class KeytarCredentialsProvider implements CredentialsProvider {

    constructor(private readonly keytarService: KeyStoreService) { }

    deletePassword(service: string, account: string): Promise<boolean> {
        return this.keytarService.deletePassword(service, account);
    }

    findCredentials(service: string): Promise<Array<{ account: string; password: string }>> {
        return this.keytarService.findCredentials(service);
    }

    findPassword(service: string): Promise<string | undefined> {
        return this.keytarService.findPassword(service);
    }

    getPassword(service: string, account: string): Promise<string | undefined> {
        return this.keytarService.getPassword(service, account);
    }

    setPassword(service: string, account: string, password: string): Promise<void> {
        return this.keytarService.setPassword(service, account, password);
    }
}
