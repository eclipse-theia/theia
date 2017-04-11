import { injectable, inject } from "inversify";
import { TextDocument } from 'vscode-languageserver-types';
import { m2p } from './monaco-converter';
import { Event, Emitter } from "../../application/common";
import { Workspace, TextDocumentDidChangeEvent } from "../../languages/common";
import { FileSystem, Path } from "../../filesystem/common";
import IModel = monaco.editor.IModel;

@injectable()
export class MonacoWorkspace implements Workspace {
    protected resolveReady: () => void;
    readonly ready = new Promise<void>(resolve => {
        this.resolveReady = resolve;
    });
    protected _rootUri: string | null = null;
    protected readonly documents = new Map<string, TextDocument>();
    protected readonly onDidOpenTextDocumentEmitter = new Emitter<TextDocument>();
    protected readonly onDidCloseTextDocumentEmitter = new Emitter<TextDocument>();
    protected readonly onDidChangeTextDocumentEmitter = new Emitter<TextDocumentDidChangeEvent>();
    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem
    ) {
        fileSystem.toUri(Path.ROOT).then(rootUri => {
            this._rootUri = rootUri;
            this.resolveReady();
        });
        for (const model of monaco.editor.getModels()) {
            this.addModel(model);
        }
        monaco.editor.onDidCreateModel(model => this.addModel(model));
        monaco.editor.onWillDisposeModel(model => this.removeModel(model));
    }
    get rootUri() {
        return this._rootUri;
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
                contentChanges: [{ range, rangeLength, text }]
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
