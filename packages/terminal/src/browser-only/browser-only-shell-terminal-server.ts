// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
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

import { injectable } from '@theia/core/shared/inversify';
import { Event } from '@theia/core/lib/common/event';
import type { IBaseTerminalClient, TerminalProcessInfo } from '../common/base-terminal-protocol';
import type {
    IShellTerminalServer,
    SerializableEnvironmentVariableCollection
} from '../common/shell-terminal-protocol';
import type { MarkdownString } from '@theia/core/lib/common/markdown-rendering/markdown-string';

@injectable()
export class BrowserOnlyShellTerminalServer implements IShellTerminalServer {

    readonly onDidOpenConnection = Event.None;
    readonly onDidCloseConnection = Event.None;

    dispose(): void {
        // no-op
    }

    setClient(_client: IBaseTerminalClient | undefined): void {
        // no-op
    }

    getDefaultShell(): Promise<string> {
        return Promise.resolve('/bin/sh');
    }

    create(): Promise<number> {
        return Promise.reject(new Error('Terminal is not available in browser-only'));
    }

    getProcessId(): Promise<number> {
        return Promise.reject(new Error('Terminal is not available in browser-only'));
    }

    getProcessInfo(): Promise<TerminalProcessInfo> {
        return Promise.reject(new Error('Terminal is not available in browser-only'));
    }

    getCwdURI(): Promise<string> {
        return Promise.reject(new Error('Terminal is not available in browser-only'));
    }

    resize(): Promise<void> {
        return Promise.resolve();
    }

    attach(): Promise<number> {
        return Promise.reject(new Error('Terminal is not available in browser-only'));
    }

    onAttachAttempted(): Promise<void> {
        return Promise.resolve();
    }

    close(): Promise<void> {
        return Promise.resolve();
    }

    hasChildProcesses(): Promise<boolean> {
        return Promise.resolve(false);
    }

    getEnvVarCollectionDescriptionsByExtension(): Promise<Map<string, (string | MarkdownString | undefined)[]>> {
        return Promise.resolve(new Map());
    }

    getEnvVarCollections(): Promise<[string, string, boolean, SerializableEnvironmentVariableCollection][]> {
        return Promise.resolve([]);
    }

    restorePersisted(): void {
        // no-op
    }

    setCollection(): void {
        // no-op
    }

    deleteCollection(): void {
        // no-op
    }
}
