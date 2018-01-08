/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
