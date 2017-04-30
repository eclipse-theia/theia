import { inject, injectable } from 'inversify';
import { DisposableCollection, Disposable } from "../../application/common";
import { FileSystem, FileStat } from '../../filesystem/common';
import { MonacoEditorModel, TextDocumentSaveReason } from "./monaco-editor-model";
import ITextModelResolverService = monaco.editor.ITextModelResolverService;
import ITextModelContentProvider = monaco.editor.ITextModelContentProvider;
import ITextEditorModel = monaco.editor.ITextEditorModel;
import IReference = monaco.editor.IReference;
import IDisposable = monaco.IDisposable;
import Uri = monaco.Uri;

@injectable()
export class MonacoModelResolver implements ITextModelResolverService {

    protected readonly models = new Map<string, monaco.Promise<MonacoEditorModel>>();
    protected readonly references = new Map<ITextEditorModel, DisposableCollection>();

    constructor( @inject(FileSystem) protected readonly fileSystem: FileSystem) {
    }

    createModelReference(uri: Uri): monaco.Promise<IReference<MonacoEditorModel>> {
        return this.getOrCreateModel(uri).then(model =>
            this.newReference(model)
        );
    }

    protected newReference(model: MonacoEditorModel): IReference<MonacoEditorModel> {
        let references = this.references.get(model);
        if (references === undefined) {
            references = new DisposableCollection();
            references.onDispose(() => model.dispose());
            model.onDispose(() => {
                this.references.delete(model);
                references!.dispose();
            });
            this.references.set(model, references);
        }

        let removeReference: Disposable;
        const reference: IReference<MonacoEditorModel> = {
            object: model,
            dispose: () =>
                removeReference.dispose()
        }
        removeReference = references.push(reference);
        return reference;
    }

    protected getOrCreateModel(uri: Uri): monaco.Promise<MonacoEditorModel> {
        const key = uri.path;
        const model = this.models.get(key);
        if (model) {
            return model;
        }
        const newModel = this.createModel(uri);
        this.models.set(key, newModel);
        newModel.then(m => m.onDispose(() => this.models.delete(key)));
        return newModel;
    }

    protected createModel(uri: Uri): monaco.Promise<MonacoEditorModel> {
        const encoding = document.characterSet;
        const source = new FileStatSource(uri, encoding, this.fileSystem);
        return new MonacoEditorModel(source).load();
    }

    registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider): IDisposable {
        return {
            dispose(): void {
                // no-op
            }
        }
    }
}

export class FileStatSource implements MonacoEditorModel.Source {

    protected stat: FileStat;

    constructor(
        readonly uri: Uri,
        protected readonly encoding: string,
        protected readonly fileSystem: FileSystem
    ) { }

    resolve(): Promise<string> {
        return this.fileSystem.resolveContent(this.uri.toString(), this.encoding).then(result => {
            this.stat = result.stat;
            return result.content;
        });
    }

    save(content: string, reason: TextDocumentSaveReason): Promise<void> {
        return this.fileSystem.setContent(this.stat, content, this.encoding).then(newStat => {
            this.stat = newStat;
        });
    }

}
