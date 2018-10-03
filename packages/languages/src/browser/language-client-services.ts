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

import * as services from 'monaco-languageclient/lib/services';
import * as connection from 'monaco-languageclient/lib/connection';
import * as base from 'monaco-languageclient/lib/monaco-language-client';
export * from 'monaco-languageclient';
export * from '../common';

export interface Language {
    readonly id: string;
    readonly name: string;
    readonly extensions: Set<string>;
    readonly filenames: Set<string>;
}

export interface WorkspaceSymbolProvider extends services.WorkspaceSymbolProvider {
    resolveWorkspaceSymbol?(symbol: services.SymbolInformation, token: services.CancellationToken): Thenable<services.SymbolInformation>
}

export const Languages = Symbol('Languages');
export interface Languages extends services.Languages {
    readonly workspaceSymbolProviders?: WorkspaceSymbolProvider[];
    readonly languages?: Language[]
    getLanguage?(languageId: string): Language | undefined;
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
export interface ILanguageClient extends base.MonacoLanguageClient { }

export interface LanguageClientOptions extends base.LanguageClientOptions { }
