import { Workspace, TextDocumentDidChangeEvent } from "../common";
import { Event, Emitter, Disposable, DisposableCollection } from "../../application/common";
import { TextDocuments, TextDocument, IConnection } from "vscode-languageserver";

export class RemoteWorkspace implements Workspace, Disposable {
    protected readonly documents = new TextDocuments();
    protected readonly onDidOpenTextDocumentEmitter = new Emitter<TextDocument>();
    protected readonly onDidCloseTextDocumentEmitter = new Emitter<TextDocument>();
    protected readonly onDidChangeTextDocumentEmitter = new Emitter<TextDocumentDidChangeEvent>();
    protected readonly toDispose = new DisposableCollection();
    constructor(readonly rootUri: string | null) {
        this.toDispose.push(this.onDidOpenTextDocumentEmitter);
        this.toDispose.push(this.onDidCloseTextDocumentEmitter);
        this.toDispose.push(this.onDidChangeTextDocumentEmitter);
    }
    dispose() {
        this.toDispose.dispose();
    }
    listen(connection: IConnection): void {
        connection.onInitialize(params => {
            return {
                capabilities: {
                    textDocumentSync: this.documents.syncKind
                }
            }
        });
        this.documents.listen(connection);
        this.documents.onDidOpen(e => {
            this.onDidOpenTextDocumentEmitter.fire(e.document)
        });
        this.documents.onDidClose(e => {
            this.onDidCloseTextDocumentEmitter.fire(e.document)
        });
        this.documents.onDidChangeContent(e => {
            const text = e.document.getText();
            const params = {
                textDocument: e.document,
                contentChanges: [{ text }]
            };
            this.onDidChangeTextDocumentEmitter.fire(params);
        });
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
    get textDocuments() {
        return this.documents.all();
    }
}