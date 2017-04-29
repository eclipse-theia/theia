import { TextDocumentSaveReason } from "vscode-languageserver-types";
import { DisposableCollection, Disposable, Emitter, Event } from '../../../application/common';
import Uri = monaco.Uri;
import ITextEditorModel = monaco.editor.ITextEditorModel;

export {
    TextDocumentSaveReason
}

export interface WillSaveModelEvent {
    readonly model: monaco.editor.IModel;
    readonly reason: TextDocumentSaveReason;
    waitUntil(thenable: Thenable<monaco.editor.IIdentifiedSingleEditOperation[]>): void;
}

export class MonacoEditorModel implements ITextEditorModel {

    autoSave: boolean = true;
    autoSaveDelay: number = 500;

    protected model: monaco.editor.IModel;
    protected readonly resolveModel: Promise<void>;

    protected readonly toDispose = new DisposableCollection();
    protected readonly toDisposeOnAutoSave = new DisposableCollection();

    protected readonly onDidSaveModelEmitter = new Emitter<monaco.editor.IModel>();
    protected readonly onWillSaveModelEmitter = new Emitter<WillSaveModelEvent>();

    constructor(protected readonly source: MonacoEditorModel.Source) {
        this.toDispose.push(this.toDisposeOnAutoSave);
        this.toDispose.push(this.onDidSaveModelEmitter);
        this.toDispose.push(this.onWillSaveModelEmitter);
        this.resolveModel = source.resolve().then(content => this.initialize(content));
    }

    /**
     * #### Important
     * Only this method can create an instance of `monaco.editor.IModel`,
     * there should not be other calls to `monaco.editor.createModel`.
     */
    protected initialize(content: string) {
        if (!this.toDispose.disposed) {
            this.model = monaco.editor.createModel(content, this.source.languageId, this.source.uri);
            this.toDispose.push(this.model);
            this.toDispose.push(this.model.onDidChangeContent(event => this.doAutoSave()));
        }
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    get onDispose(): monaco.IEvent<void> {
        return this.toDispose.onDispose;
    }

    get textEditorModel(): monaco.editor.IModel {
        return this.model;
    }

    get onWillSaveModel(): Event<WillSaveModelEvent> {
        return this.onWillSaveModelEmitter.event;
    }

    get onDidSaveModel(): Event<monaco.editor.IModel> {
        return this.onDidSaveModelEmitter.event;
    }

    load(): monaco.Promise<MonacoEditorModel> {
        return monaco.Promise.wrap(this.resolveModel).then(() => this);
    }

    save(): Promise<void> {
        return this.doSave(TextDocumentSaveReason.Manual);
    }

    protected doAutoSave(): void {
        if (this.autoSave) {
            const handle = window.setTimeout(() => {
                this.toDisposeOnAutoSave.dispose();
                this.doSave(TextDocumentSaveReason.AfterDelay);
            }, this.autoSaveDelay);
            this.toDisposeOnAutoSave.push(Disposable.create(() =>
                window.clearTimeout(handle))
            );
        }
    }

    protected doSave(reason: TextDocumentSaveReason): Promise<void> {
        return this.fireWillSaveModel(reason).then(() => {
            const content = this.model.getValue();
            return this.source.save(content, reason).then(() =>
                this.onDidSaveModelEmitter.fire(this.model)
            );
        });
    }

    protected fireWillSaveModel(reason: TextDocumentSaveReason): Promise<void> {
        const model = this.model;
        return new Promise<void>(resolve => {
            this.onWillSaveModelEmitter.fire({
                model, reason,
                waitUntil: thenable =>
                    thenable.then(operations => {
                        model.applyEdits(operations);
                        resolve();
                    })
            });
        });
    }

    protected fireDidSaveModel(): void {
        this.onDidSaveModelEmitter.fire(this.model);
    }
}

export namespace MonacoEditorModel {
    export interface Source {
        readonly uri: Uri;
        readonly languageId?: string;
        resolve(): Promise<string>;
        save(content: string, reason: TextDocumentSaveReason): Promise<void>;
    }
}
