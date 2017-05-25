/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Disposable } from "../../application/common";
import { FrontendApplication } from '../../application/browser';
import {
    LanguageContribution, ILanguageClient, LanguageClientOptions,
    DocumentSelector, TextDocument, FileSystemWatcher,
    Workspace, Languages
} from '../common';
import { LanguageClientFactory } from "./language-client-factory";

export {
    LanguageContribution, ILanguageClient, FrontendApplication
}

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
        const documentSelector = this.documentSelector;
        if (documentSelector) {
            return Promise.all([
                this.workspace.ready,
                this.waitForOpenTextDocument(documentSelector)
            ]);
        }
        return this.workspace.ready;
    }

    activate(): Disposable {
        const languageClient = this.createLanguageClient();
        this.onWillStart(languageClient);
        return languageClient.start();
    }

    protected onWillStart(languageClient: ILanguageClient): void {
        languageClient.onReady().then(() => this.onReady(languageClient));
    }

    protected onReady(languageClient: ILanguageClient): void {
        this._languageClient = languageClient
        this.resolveReady(this._languageClient);
        this.waitForReady();
    }

    protected waitForReady(): void {
        this.ready = new Promise<ILanguageClient>(resolve =>
            this.resolveReady = resolve
        );
    }

    protected createLanguageClient(): ILanguageClient {
        const clientOptions = this.createOptions();
        return this.languageClientFactory.get(this, clientOptions);
    }

    protected createOptions(): LanguageClientOptions {
        const fileEvents = this.createFileEvents();
        return {
            documentSelector: this.documentSelector,
            synchronize: { fileEvents }
        };
    }

    protected get documentSelector(): DocumentSelector | undefined {
        return [this.id];
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

    // FIXME move it to the workspace
    protected waitForOpenTextDocument(selector: DocumentSelector): Promise<TextDocument> {
        const document = this.workspace.textDocuments.filter(document =>
            this.languages.match(selector, document)
        )[0];
        if (document !== undefined) {
            return Promise.resolve(document);
        }
        return new Promise<TextDocument>(resolve => {
            const disposable = this.workspace.onDidOpenTextDocument(document => {
                if (this.languages.match(selector, document)) {
                    disposable.dispose();
                    resolve(document);
                }
            });
        });
    }

}