/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { TextDocumentContentChangeEvent } from "vscode-languageserver-types";
import { ReferenceCollection, Reference } from "@theia/core";
import URI from "@theia/core/lib/common/uri";
import { DocumentManager, DocumentManagerClient } from "../common";
import { Document, FileDocument } from "./document";

// FIXME: should we ensure that all requests processed in order? here?
@injectable()
export class DocumentManagerImpl implements DocumentManager {

    protected readonly documents = new ReferenceCollection<string, Document>(
        uri => this.create(uri)
    );

    dispose(): void {
        this.documents.dispose();
    }

    protected client: DocumentManagerClient | undefined;
    setClient(client: DocumentManagerClient | undefined): void {
        this.client = client;
    }

    async open(uri: string): Promise<void> {
        const { object } = await this.documents.acquire(uri);
        object.onDidChange(() => {
            if (this.client) {
                this.client.onDidChange(uri);
            }
        });
    }

    async read(uri: string): Promise<string> {
        const reference = await this.get(uri);
        try {
            return reference.object.content.getText();
        } finally {
            reference.dispose();
        }
    }

    async update(uri: string, changes: TextDocumentContentChangeEvent[]): Promise<void> {
        const reference = await this.get(uri);
        try {
            return reference.object.update(changes);
        } finally {
            reference.dispose();
        }
    }

    async save(uri: string): Promise<void> {
        const reference = await this.get(uri);
        try {
            return reference.object.save();
        } finally {
            reference.dispose();
        }
    }

    async close(uri: string): Promise<void> {
        const { object } = await this.get(uri);
        object.dispose();
    }

    protected async get(uri: string): Promise<Reference<Document>> {
        if (this.documents.has(uri)) {
            return this.documents.acquire(uri);
        }
        throw new Error(`${uri} is not opened`);
    }

    protected async create(stringUri: string): Promise<Document> {
        // FIXME support other documents?
        const resource = new FileDocument(new URI(stringUri));
        await resource.ready;
        return resource;
    }

}
