/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, postConstruct } from "inversify";
import { TextDocumentContentChangeEvent } from "vscode-languageserver-types";
import { Resource, ResourceResolver, Emitter, Event, Disposable, DisposableCollection, ReferenceCollection } from "@theia/core";
import URI from "@theia/core/lib/common/uri";
import { DocumentManager, DispatchingDocumentManagerClient } from "../common";

export class FileResource implements Resource {

    protected readonly toDispose = new DisposableCollection();
    protected readonly onDidChangeContentsEmitter = new Emitter<void>();
    readonly onDidChangeContents: Event<void> = this.onDidChangeContentsEmitter.event;

    protected uriString: string;

    constructor(
        readonly uri: URI,
        protected readonly server: DocumentManager,
        client: DispatchingDocumentManagerClient
    ) {
        this.uriString = this.uri.toString();
        this.toDispose.push(Disposable.create(() => this.server.close(this.uriString)));
        this.toDispose.push(this.onDidChangeContentsEmitter);
        this.toDispose.push(client.set(this.uriString, {
            onDidChange: () => this.onDidChangeContentsEmitter.fire(undefined)
        }));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    readContents(): Promise<string> {
        return this.server.read(this.uriString);
    }

    updateContents(changes: TextDocumentContentChangeEvent[]): Promise<void> {
        return this.server.update(this.uriString, changes);
    }

    saveContents(): Promise<void> {
        return this.server.save(this.uriString);
    }

}

@injectable()
export class FileResourceResolver implements ResourceResolver {

    protected readonly resources = new ReferenceCollection<string, FileResource>(
        async uri => this.createResource(uri)
    );

    @inject(DocumentManager)
    protected readonly documents: DocumentManager;
    protected readonly client = new DispatchingDocumentManagerClient();

    @postConstruct()
    protected init(): void {
        this.documents.setClient(this.client);
    }

    async resolve(uri: URI): Promise<FileResource> {
        if (uri.scheme !== 'file') {
            throw new Error('The given uri is not file uri: ' + uri);
        }
        const { object } = await this.resources.acquire(uri.toString());
        return object;
    }

    protected async createResource(uri: string): Promise<FileResource> {
        await this.documents.open(uri);
        return new FileResource(new URI(uri), this.documents, this.client);
    }

}
