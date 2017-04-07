import { injectable } from "inversify";
import { TextDocument } from 'vscode-languageserver-types';
import { m2p } from './monaco-converter';
import { Event, Emitter } from "../../application/common";
import { Workspace, TextDocumentDidChangeEvent } from "../../languages/common";
import IModel = monaco.editor.IModel;

@injectable()
export class MonacoWorkspace implements Workspace {
    readonly rootUri = null;
    protected readonly documents = new Map<string, TextDocument>();
    protected readonly onDidOpenTextDocumentEmitter = new Emitter<TextDocument>();
    protected readonly onDidCloseTextDocumentEmitter = new Emitter<TextDocument>();
    protected readonly onDidChangeTextDocumentEmitter = new Emitter<TextDocumentDidChangeEvent>();
    constructor() {
        for (const model of monaco.editor.getModels())  {
            this.addModel(model);
        }
        monaco.editor.onDidCreateModel(model => this.addModel(model));
        monaco.editor.onWillDisposeModel(model => this.removeModel(model));
    }
    protected removeModel(model: IModel): void {
        const uri = model.uri.toString();
        const document = this.documents.get(uri);
        if (document) {
            this.documents.delete(uri);
            this.onDidCloseTextDocumentEmitter.fire(document);
        }
    }
    protected addModel(model: IModel): void {
        const uri = model.uri.toString();
        this.onDidOpenTextDocumentEmitter.fire(this.setModel(uri, model))
        model.onDidChangeContent(event => {
            const textDocument = this.setModel(uri, model);
            const range = m2p.asRange(event.range);
            const rangeLength = event.rangeLength;
            const text = event.text;
            this.onDidChangeTextDocumentEmitter.fire({
                textDocument,
                contentChanges: [{range, rangeLength, text}]
            });
        });
    }
    protected setModel(uri: string, model: IModel): TextDocument {
        const document = TextDocument.create(uri, model.getModeId(), model.getVersionId(), model.getValue());
        this.documents.set(uri, document);
        return document;
    }
    get textDocuments(): TextDocument[] {
        return Array.from(this.documents.values());
    }
    get onDidOpenTextDocument(): Event<TextDocument> {
        return this.onDidOpenTextDocumentEmitter.event;
    }
    get onDidCloseTextDocument(): Event<TextDocument> {
        return this.onDidCloseTextDocumentEmitter.event;
    }
    get onDidChangeTextDocument(): Event<TextDocumentDidChangeEvent> {
        return this.onDidChangeTextDocumentEmitter.event;
    }
}
