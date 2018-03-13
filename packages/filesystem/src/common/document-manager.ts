/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable, postConstruct } from "inversify";
import { TextDocumentContentChangeEvent } from "vscode-languageserver-types";
import { JsonRpcServer, Disposable, DisposableCollection, JsonRpcProxy } from "@theia/core";

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

export const DocumentManagerProxy = Symbol('DocumentManagerProxy');
export type DocumentManagerProxy = JsonRpcProxy<DocumentManager>;

@injectable()
export class ReconnectingDocumentManager implements DocumentManager {

    @inject(DocumentManagerProxy)
    protected readonly proxy: DocumentManagerProxy;

    protected readonly opened = new Set<string>();

    @postConstruct()
    protected init(): void {
        this.proxy.onDidOpenConnection(() => this.connected = true);
        this.proxy.onDidCloseConnection(() => this.connected = false);
    }

    protected _connected = false;
    protected readonly toDisposeOnConnect = new DisposableCollection();
    protected get connected() {
        return this._connected;
    }
    protected set connected(connected: boolean) {
        this._connected = connected;
        if (connected) {
            this.toDisposeOnConnect.dispose();
        }
        if (!connected) {
            this.toDisposeOnConnect.push(Disposable.create(() => this.reconnect()));
        }
    }

    protected reconnect(): void {
        for (const uri of this.opened) {
            this.reopen(uri);
        }
    }
    protected async reopen(uri: string): Promise<void> {
        try {
            await this.proxy.open(uri);
            if (this.client) {
                this.client.onDidChange(uri);
            }
        } catch (e) {
            console.error(e);
        }
    }

    dispose(): void {
        this.proxy.dispose();
    }

    async open(uri: string): Promise<void> {
        await this.proxy.open(uri);
        this.opened.add(uri);
    }

    protected pendingUpdates = Promise.resolve();
    update(uri: string, changes: TextDocumentContentChangeEvent[]): Promise<void> {
        return this.pendingUpdates = this.pendingUpdates.then(() => this.doUpdate(uri, changes));
    }
    protected flush(uri: string): Promise<void> {
        return this.update(uri, []);
    }

    protected readonly pendingChanges = new Map<string, TextDocumentContentChangeEvent[]>();
    protected async doUpdate(uri: string, newChanges: TextDocumentContentChangeEvent[]): Promise<void> {
        const pendingChanges = this.pendingChanges.get(uri) || [];
        const changes = [...pendingChanges, ...newChanges];
        if (changes.length === 0) {
            return;
        }
        this.pendingChanges.set(uri, changes);
        if (!this.connected) {
            return;
        }
        try {
            await this.proxy.update(uri, changes);
            this.pendingChanges.set(uri, []);
        } catch (e) {
            console.error(e);
        }
    }

    async read(uri: string): Promise<string> {
        await this.flush(uri);
        return this.proxy.read(uri);
    }

    async save(uri: string): Promise<void> {
        await this.flush(uri);
        return this.proxy.save(uri);
    }

    async close(uri: string): Promise<void> {
        await this.flush(uri);
        await this.proxy.close(uri);
        this.opened.delete(uri);
    }

    protected client: DocumentManagerClient | undefined;
    setClient(client: DocumentManagerClient | undefined): void {
        this.client = client;
        this.proxy.setClient(client);
    }

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
