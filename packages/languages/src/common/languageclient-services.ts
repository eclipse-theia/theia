/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import * as base from 'vscode-base-languageclient/lib/base';
import * as services from 'vscode-base-languageclient/lib/services';
import * as connection from 'vscode-base-languageclient/lib/connection';
import { WorkspaceSymbolProvider } from 'vscode-base-languageclient/lib/services';
export * from 'vscode-base-languageclient/lib/services';
export * from 'vscode-base-languageclient/lib/connection';
export { BaseLanguageClient } from 'vscode-base-languageclient/lib/base';

export interface Language {
    readonly id: string;
    readonly name: string;
}

export const Languages = Symbol('Languages');
export interface Languages extends services.Languages {
    readonly workspaceSymbolProviders?: WorkspaceSymbolProvider[];
    readonly languages?: Language[]
}

export const Workspace = Symbol('Workspace');
export interface Workspace extends services.Workspace {
    readonly ready: Promise<void>;
}

export const Commands = Symbol('Commands');
export interface Commands extends services.Commands { }

export const Window = Symbol('Window');
export interface Window extends services.Window { }

export const IConnectionProvider = Symbol('IConnectionProvider');
export interface IConnectionProvider extends connection.IConnectionProvider { }

export const ILanguageClient = Symbol('ILanguageClient');
export interface ILanguageClient extends base.BaseLanguageClient { }

export interface LanguageClientOptions extends base.BaseLanguageClientOptions {
    commands: Commands | undefined
}
