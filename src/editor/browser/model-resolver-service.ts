import { Disposable, DisposableCollection } from '../../application/common';
import { FileSystem2, FileStat } from '../../filesystem/common/filesystem2';
import { inject, injectable } from 'inversify';
import ITextModelResolverService = monaco.editor.ITextModelResolverService;
import ITextModelContentProvider = monaco.editor.ITextModelContentProvider;
import ITextEditorModel = monaco.editor.ITextEditorModel;
import IReference = monaco.editor.IReference;
import IDisposable = monaco.IDisposable;
import Uri = monaco.Uri;
import IModel = monaco.editor.IModel;

@injectable()
export class TextModelResolverService implements ITextModelResolverService {

    protected readonly models = new Map<string, monaco.Promise<ReferenceAwareModel> | undefined>();

    constructor(@inject(FileSystem2) protected readonly fileSystem: FileSystem2) {
    }

    createModelReference(uri: Uri): monaco.Promise<IReference<ITextEditorModel>> {
        return this.getOrCreateModel(uri).then(model => model.newReference());
    }

    protected getOrCreateModel(uri: Uri): monaco.Promise<ReferenceAwareModel> {
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

    protected createModel(uri: Uri): monaco.Promise<ReferenceAwareModel> {
        const encoding = document.characterSet;
        return monaco.Promise.wrap(this.fileSystem.resolveContent(uri.toString(), encoding).then(result => {
            const model = monaco.editor.createModel(result.content, undefined, uri);
            model.onDidChangeContent(() => this.save(result.stat, model, encoding));
            return new ReferenceAwareModel(model);
        }));
    }

    protected readonly toDisposeOnSave = new DisposableCollection();

    protected save(stat: FileStat, model: IModel, encoding: string): void {
        this.toDisposeOnSave.dispose();
        const handle = window.setTimeout(() => {
            this.fileSystem.setContent(stat, model.getValue(), encoding);
        }, 500);
        this.toDisposeOnSave.push(Disposable.create(() => window.clearTimeout(handle)));
    }

    registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider): IDisposable {
        return {
            dispose(): void {
                // no-op
            }
        }
    }
}

export class ReferenceAwareModel implements ITextEditorModel {
    protected referenceCount = 0;
    protected model: monaco.editor.IModel;
    protected _onDispose: monaco.Emitter<void>;

    constructor(model: monaco.editor.IModel) {
        this.model = model;
        this._onDispose = new monaco.Emitter<void>();
    }

    newReference(): IReference<ITextEditorModel> {
        const object = this;
        object.referenceCount++;
        return {
            object,
            dispose: () => {
                object.referenceCount--;
                if (object.referenceCount === 0) {
                    object.dispose();
                }
            }
        }
    }

    get onDispose(): monaco.IEvent<void> {
        return this._onDispose.event;
    }

    load(): monaco.Promise<ReferenceAwareModel> {
        return monaco.Promise.as(this);
    }

    get textEditorModel(): monaco.editor.IModel {
        return this.model;
    }

    dispose(): void {
        this.model.dispose();
        this._onDispose.fire();
    }
}
