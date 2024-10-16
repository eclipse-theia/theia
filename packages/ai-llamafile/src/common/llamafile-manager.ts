// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
export const LlamafileManager = Symbol('LlamafileManager');

export const LlamafileManagerPath = '/services/llamafilemanager';

export interface LlamafileManager {
    startServer(name: string): Promise<void>;
    stopServer(name: string): void;
    getStartedLlamafiles(): Promise<string[]>;
    setClient(client: LlamafileServerManagerClient): void;
    addLanguageModels(llamaFiles: LlamafileEntry[]): Promise<void>;
    removeLanguageModels(modelIds: string[]): void;
}
export interface LlamafileServerManagerClient {
    log(llamafileName: string, message: string): void;
    error(llamafileName: string, message: string): void;
}

export interface LlamafileEntry {
    name: string;
    uri: string;
    port: number;
}

export namespace LlamafileEntry {
    export function equals(a: LlamafileEntry, b: LlamafileEntry): boolean {
        return a.name === b.name && a.uri === b.uri && a.port === b.port;
    }
    export function is(entry: unknown): entry is LlamafileEntry {
        // eslint-disable-next-line no-null/no-null
        return typeof entry === 'object' && entry !== null
            && 'name' in entry && typeof entry.name === 'string'
            && 'uri' in entry && typeof entry.uri === 'string'
            && 'port' in entry && typeof entry.port === 'number';
    }
}
