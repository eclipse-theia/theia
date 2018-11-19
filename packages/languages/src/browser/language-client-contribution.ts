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

// tslint:disable:no-any

import { injectable, inject } from 'inversify';
import { MaybePromise, MessageService, CommandRegistry } from '@theia/core';
import { Disposable, DisposableCollection } from '@theia/core/lib/common';
import { FrontendApplication, WebSocketConnectionProvider } from '@theia/core/lib/browser';
import {
    LanguageContribution, ILanguageClient, LanguageClientOptions,
    DocumentSelector, TextDocument, FileSystemWatcher,
    Workspace, Languages, State
} from './language-client-services';
import { MessageConnection, ResponseError } from 'vscode-jsonrpc';
import { LanguageClientFactory } from './language-client-factory';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { InitializeParams } from 'monaco-languageclient';

export const LanguageClientContribution = Symbol('LanguageClientContribution');
export interface LanguageClientContribution extends LanguageContribution {
    readonly running: boolean;
    readonly languageClient: Promise<ILanguageClient>;
    waitForActivation(app: FrontendApplication): Promise<void>;
    activate(app: FrontendApplication): Disposable;
    deactivate(): void;
    restart(): void;
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
    @inject(LanguageContribution.Service) protected readonly languageContributionService: LanguageContribution.Service;
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

    // tslint:disable-next-line:no-any
    waitForActivation(app: FrontendApplication): Promise<any> {
        // tslint:disable-next-line:no-any
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

    protected readonly toDeactivate = new DisposableCollection();
    activate(): Disposable {
        if (this.toDeactivate.disposed) {
            const toStop = new DisposableCollection(Disposable.NULL); // mark as not disposed
            this.toDeactivate.push(toStop);
            this.doActivate(toStop);
        }
        return this.toDeactivate;
    }
    deactivate(): void {
        this.toDeactivate.dispose();
    }

    protected stop = Promise.resolve();
    protected async doActivate(toStop: DisposableCollection): Promise<void> {
        try {
            // make sure that the previous client is stopped to avoid duplicate commands and language services
            await this.stop;
            if (toStop.disposed) {
                return;
            }
            const startParameters = await this.getStartParameters();
            if (toStop.disposed) {
                return;
            }
            const sessionId = await this.languageContributionService.create(this.id, startParameters);
            if (toStop.disposed) {
                this.languageContributionService.destroy(sessionId);
                return;
            }
            toStop.push(Disposable.create(() => this.languageContributionService.destroy(sessionId)));
            this.connectionProvider.listen({
                path: LanguageContribution.getPath(this, sessionId),
                onConnection: messageConnection => {
                    if (toStop.disposed) {
                        messageConnection.dispose();
                        return;
                    }
                    const languageClient = this.createLanguageClient(messageConnection);
                    toStop.push(Disposable.create(() => this.stop = (async () => {
                        try {
                            // avoid calling stop if start failed
                            await languageClient.onReady();
                            // remove all listerens and close the connection under the hood
                            await languageClient.stop();
                        } catch {
                            try {
                                // if start or stop failed make sure the the connection is closed
                                messageConnection.dispose();
                            } catch { /* no-op */ }
                        }
                    })()));
                    toStop.push(messageConnection.onClose(() => this.restart()));
                    this.onWillStart(languageClient);
                    languageClient.start();
                }
            }, { reconnecting: false });
        } catch (e) {
            console.error(e);
            if (!toStop.disposed) {
                this.restart();
            }
        }
    }

    protected state: State | undefined;
    get running(): boolean {
        return !this.toDeactivate.disposed && this.state === State.Running;
    }

    restart(): void {
        this.deactivate();
        this.activate();
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
            initializationFailedHandler: err => this.handleInitializationFailed(err),
            diagnosticCollectionName: id,
            initializationOptions
        };
    }
    protected handleInitializationFailed(err: ResponseError<InitializeParams> | Error | any): boolean {
        this.deactivate();
        const detail = err instanceof Error ? `: ${err.message}` : '.';
        this.messageService.error(`Failed to start ${this.name} language server${detail}`, 'Retry').then(result => {
            if (result) {
                this.activate();
            }
        });
        return false;
    }

    protected getStartParameters(): MaybePromise<any> {
        return undefined;
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
    // tslint:disable-next-line:no-any
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
