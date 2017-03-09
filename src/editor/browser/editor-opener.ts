import {IOpenerService, TheiaApplication, TheiaPlugin} from "../../application/browser";
import {FileSystem, Path} from "../../filesystem/common";
import {EditorWidget} from "./editor-widget";
import {inject, injectable} from "inversify";
import {DisposableCollection, Disposable} from "../../application/common";
import Uri = monaco.Uri;
import IModel = monaco.editor.IModel;

@injectable()
export class EditorOpenerService implements IOpenerService, TheiaPlugin {

    protected editors = new Map<string, Promise<EditorWidget> | EditorWidget | undefined>();

    protected app: TheiaApplication | undefined;

    constructor(@inject(FileSystem) protected readonly fileSystem: FileSystem) {
    }

    onStart(app: TheiaApplication): void {
        this.app = app;
    }

    open<Input extends Path, Resource extends EditorWidget>(path: Input): Promise<Resource> | undefined {
        const app = this.app;
        if (!app || !(path instanceof Path)) {
            return undefined;
        }
        const key = path.toString();
        const promiseOrEditor = this.editors.get(key);
        if (promiseOrEditor) {
            return Promise.resolve(promiseOrEditor).then(editor => {
                app.shell.activateMain(editor.id);
                return editor;
            });
        }
        const encoding = document.characterSet;
        return this.fileSystem.readFile(path, encoding).then(value => {
            const uri = Uri.file(key);
            const model = monaco.editor.createModel(value, undefined, uri);
            model.onDidChangeContent(() => this.save(model, encoding));
            const editor = new EditorWidget({
                model,
                wordWrap: true,
                folding: true
            });
            editor.id = `editor-${this.editors.size}`;
            editor.title.label = path.simpleName || 'Unknown';
            editor.title.closable = true;
            this.editors.set(key, editor);
            editor.disposed.connect(() => {
                // FIXME provide model manager: (1) reference counting, (2) notifications, (3) content synchronization
                model.dispose();
                this.editors.delete(key);
            });
            app.shell.addToMainArea(editor);
            app.shell.activateMain(editor.id);
            return editor;
        }, (reason) => {
            this.editors.delete(key);
            throw reason;
        });
    }

    protected readonly toDisposeOnSave = new DisposableCollection();

    protected save(model: IModel, encoding: string): void {
        this.toDisposeOnSave.dispose();
        const handle = window.setTimeout(() => {
            const path = Path.fromString(model.uri.path);
            this.fileSystem.writeFile(path, model.getValue(), encoding);
        }, 500);
        this.toDisposeOnSave.push(Disposable.create(() => window.clearTimeout(handle)));
    }

}
