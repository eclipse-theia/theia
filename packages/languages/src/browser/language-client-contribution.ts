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

import { injectable, inject } from 'inversify';
import { MessageService, CommandRegistry } from '@theia/core';
import { Disposable, DisposableCollection } from '@theia/core/lib/common';
import { FrontendApplication, WebSocketConnectionProvider, WebSocketOptions } from '@theia/core/lib/browser';
import {
    LanguageContribution, ILanguageClient, LanguageClientOptions,
    DocumentSelector, TextDocument, FileSystemWatcher,
    Workspace, Languages, State
} from './language-client-services';
import { MessageConnection } from 'vscode-jsonrpc';
import { LanguageClientFactory } from './language-client-factory';
import { WorkspaceService } from '@theia/workspace/lib/browser';

export const LanguageClientContribution = Symbol('LanguageClientContribution');
export interface LanguageClientContribution extends LanguageContribution {
    readonly languageClient: Promise<ILanguageClient>;
    waitForActivation(app: FrontendApplication): Promise<void>;
    activate(app: FrontendApplication): Disposable;
}

@injectable()
export abstract class BaseLanguageClientContribution implements LanguageClientContribution {

    abstract readonly id: string;
    abstract readonly name: string;

    protected _languageClient: ILanguageClient | undefined;

    protected resolveReady: (languageClient: ILanguageClient) => void;
    protected ready: Promise<ILanguageClient>;

    @inject(MessageService) protected readonly messageService: MessageService;
    @inject(CommandRegistry) protected readonly registry: CommandRegistry;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(WebSocketConnectionProvider) protected readonly connectionProvider: WebSocketConnectionProvider;

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(Languages) protected readonly languages: Languages,
        @inject(LanguageClientFactory) protected readonly languageClientFactory: LanguageClientFactory
    ) {
        this.waitForReady();
    }

    get languageClient(): Promise<ILanguageClient> {
        return this._languageClient ? Promise.resolve(this._languageClient) : this.ready;
    }

    waitForActivation(app: FrontendApplication): Promise<any> {
        const activationPromises: Promise<any>[] = [];
        const workspaceContains = this.workspaceContains;
        if (workspaceContains.length !== 0) {
            activationPromises.push(this.waitForItemInWorkspace());
        }
        const documentSelector = this.documentSelector;
        if (documentSelector) {
            activationPromises.push(this.waitForOpenTextDocument(documentSelector));
        }
        if (activationPromises.length !== 0) {
            return Promise.all([
                this.workspace.ready,
                Promise.race(activationPromises.map(p => new Promise(async resolve => {
                    try {
                        await p;
                        resolve();
                    } catch (e) {
                        console.error(e);
                    }
                })))
            ]);
        }
        return this.workspace.ready;
    }

    activate(): Disposable {
        const options: WebSocketOptions = {};
        const toDeactivate = new DisposableCollection();
        toDeactivate.push(Disposable.create(() => {
            options.reconnecting = false;
        }));
        this.connectionProvider.listen({
            path: LanguageContribution.getPath(this),
            onConnection: messageConnection => {
                if (toDeactivate.disposed) {
                    messageConnection.dispose();
                    return;
                }
                toDeactivate.push(messageConnection);

                const languageClient = this.createLanguageClient(messageConnection);
                this.onWillStart(languageClient);
                languageClient.start();
            }
        }, options);
        return toDeactivate;
    }

    protected state: State | undefined;
    get running(): boolean {
        return this.state === State.Running;
    }
    restart(): void {
        if (this._languageClient) {
            this._languageClient.stop();
        }
    }

    protected onWillStart(languageClient: ILanguageClient): void {
        languageClient.onDidChangeState(({ newState }) => {
            this.state = newState;
        });
        languageClient.onReady().then(() => this.onReady(languageClient));
    }

    protected onReady(languageClient: ILanguageClient): void {
        this._languageClient = languageClient;
        this.resolveReady(this._languageClient);
        this.waitForReady();
    }

    protected waitForReady(): void {
        this.ready = new Promise<ILanguageClient>(resolve =>
            this.resolveReady = resolve
        );
    }

    protected createLanguageClient(connection: MessageConnection): ILanguageClient {
        const clientOptions = this.createOptions();
        return this.languageClientFactory.get(this, clientOptions, connection);
    }

    protected createOptions(): LanguageClientOptions {
        const { id, documentSelector, fileEvents, configurationSection, initializationOptions } = this;
        return {
            documentSelector,
            synchronize: { fileEvents, configurationSection },
            initializationFailedHandler: err => {
                const detail = err instanceof Error ? `: ${err.message}` : '.';
                this.messageService.error(`Failed to start ${this.name} language server${detail}`);
                return false;
            },
            diagnosticCollectionName: id,
            initializationOptions
        };
    }

    // tslint:disable-next-line:no-any
    protected get initializationOptions(): any | (() => any) | undefined {
        return undefined;
    }

    protected get configurationSection(): string | string[] | undefined {
        return undefined;
    }

    protected get workspaceContains(): string[] {
        return [];
    }

    protected get documentSelector(): DocumentSelector | undefined {
        return [this.id];
    }

    protected _fileEvents: FileSystemWatcher[] | undefined;
    protected get fileEvents(): FileSystemWatcher[] {
        return this._fileEvents = this._fileEvents || this.createFileEvents();
    }
    protected createFileEvents(): FileSystemWatcher[] {
        const watchers = [];
        if (this.workspace.createFileSystemWatcher) {
            for (const globPattern of this.globPatterns) {
                watchers.push(this.workspace.createFileSystemWatcher(globPattern));
            }
        }
        return watchers;
    }

    protected get globPatterns(): string[] {
        return [];
    }

    /**
     * Check to see if one of the paths is in the current workspace.
     */
    protected async waitForItemInWorkspace(): Promise<any> {
        const doesContain = await this.workspaceService.containsSome(this.workspaceContains);
        if (!doesContain) {
            return new Promise(resolve => { });
        }
        return doesContain;
    }

    // FIXME move it to the workspace
    protected waitForOpenTextDocument(selector: DocumentSelector): Promise<TextDocument> {
        const document = this.workspace.textDocuments.filter(doc =>
            this.languages.match(selector, doc)
        )[0];
        if (document !== undefined) {
            return Promise.resolve(document);
        }
        return new Promise<TextDocument>(resolve => {
            const disposable = this.workspace.onDidOpenTextDocument(doc => {
                if (this.languages.match(selector, doc)) {
                    disposable.dispose();
                    resolve(doc);
                }
            });
        });
    }

}
