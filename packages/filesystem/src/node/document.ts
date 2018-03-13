/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as fs from "fs-extra";
import { TextDocument, TextDocumentContentChangeEvent } from "vscode-languageserver-types";
import { Emitter, Event, Disposable, DisposableCollection, MaybePromise } from "@theia/core";
import URI from "@theia/core/lib/common/uri";
import { FileUri } from "@theia/core/lib/node";

export interface Document extends Disposable {
    readonly content: TextDocument;
    readonly onDidChange: Event<void>;
    update(changes: TextDocumentContentChangeEvent[]): MaybePromise<void>;
    save(): MaybePromise<void>;
}

export class BaseDocument implements Document {

    protected readonly toDispose = new DisposableCollection();
    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    readonly ready: Promise<void>;
    protected _document: TextDocument;

    constructor(
        readonly uri: URI,
        readonly languageId: string = ''
    ) {
        this.toDispose.push(this.onDidChangeEmitter);
        this.ready = this.init();
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    get content(): TextDocument {
        return this._document;
    }

    protected async init(): Promise<void> {
        const content = await this.read();
        this._document = TextDocument.create(this.uri.toString(), this.languageId, 0, content);
    }

    protected async sync(): Promise<void> {
        const content = await this.read();
        if (this._document.getText() !== content) {
            this.updateDocument(content);
            this.onDidChangeEmitter.fire(undefined);
        }
    }

    update(changes: TextDocumentContentChangeEvent[]): void {
        const newContent = this.applyContenChanges(changes);
        this.updateDocument(newContent);
    }

    protected applyContenChanges(changes: TextDocumentContentChangeEvent[]): string {
        let d = this._document;
        for (const change of changes) {
            let content = change.text;
            if (change.range) {
                const start = d.offsetAt(change.range.start);
                const end = d.offsetAt(change.range.end);
                content = d.getText().substr(0, start) + change.text + d.getText().substr(end);
            }
            d = TextDocument.create(d.uri, d.languageId, d.version, content);
        }
        return d.getText();
    }

    protected updateDocument(content: string): void {
        this._document = TextDocument.create(this._document.uri, this._document.languageId, this._document.version + 1, content);
    }

    save(): MaybePromise<void> {
        // no-op
    }

    protected read(): MaybePromise<string> {
        return this._document ? this._document.getText() : '';
    }

}

export class FileDocument extends BaseDocument {

    protected fsPath: string;

    protected readonly options = {
        encoding: 'utf8'
    };

    protected async init(): Promise<void> {
        if (this.uri.scheme !== 'file') {
            throw new Error('The given uri is not a file uri: ' + this.uri);
        }
        this.fsPath = FileUri.fsPath(this.uri);

        // FIXME throw if a directory
        // FIXME await when exists

        const listener = this.sync.bind(this);
        fs.watchFile(this.fsPath, listener);
        this.toDispose.push(Disposable.create(() => fs.unwatchFile(this.fsPath, listener)));

        await super.init();
    }

    protected async read(): Promise<string> {
        try {
            const result = await fs.readFile(this.fsPath, this.options);
            return result.toString();
        } catch {
            return '';
        }
    }

    async save(): Promise<void> {
        await fs.writeFile(this.fsPath, this._document.getText(), this.options);
    }
}
