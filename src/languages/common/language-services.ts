import * as base from 'vscode-languageclient/lib/base';
import * as services from 'vscode-languageclient/lib/services';
import * as connection from 'vscode-languageclient/lib/connection';
export * from 'vscode-languageclient/lib/services';
export * from 'vscode-languageclient/lib/connection';
export { BaseLanguageClient } from 'vscode-languageclient/lib/base';

export const Languages = Symbol('Languages');
export interface Languages extends services.Languages {}

export const Workspace = Symbol('Workspace');
export interface Workspace extends services.Workspace {
    readonly ready: Promise<void>;
}

export const Commands = Symbol('Commands');
export interface Commands extends services.Commands {}

export const Window = Symbol('Window');
export interface Window extends services.Window {}

export const IConnectionProvider = Symbol('IConnectionProvider');
export interface IConnectionProvider extends connection.IConnectionProvider {}

export const ILanguageClient = Symbol('ILanguageClient');
export interface ILanguageClient extends base.BaseLanguageClient {}

export const LANGUAGES_WS_PATH = '/languages';