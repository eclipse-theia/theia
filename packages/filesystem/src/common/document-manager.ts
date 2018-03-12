/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { TextDocumentContentChangeEvent } from "vscode-languageserver-types";
import { JsonRpcServer, Disposable } from "@theia/core";

export const documentManagerPath = '/services/documents';

export const DocumentManager = Symbol('DocumentManager');
export interface DocumentManager extends JsonRpcServer<DocumentManagerClient> {
    open(uri: string): Promise<void>;
    read(uri: string): Promise<string>;
    update(uri: string, changes: TextDocumentContentChangeEvent[]): Promise<void>;
    save(uri: string): Promise<void>;
    close(uri: string): Promise<void>;
}

export interface DocumentManagerClient {
    onDidChange(uri: string): void
}

export class DispatchingDocumentManagerClient implements DocumentManagerClient {

    protected readonly clients = new Map<string, DocumentManagerClient>();

    onDidChange(uri: string): void {
        const client = this.clients.get(uri);
        if (client) {
            client.onDidChange(uri);
        }
    }

    set(uri: string, client: DocumentManagerClient): Disposable {
        this.clients.set(uri, client);
        return Disposable.create(() => this.clients.delete(uri));
    }

}
