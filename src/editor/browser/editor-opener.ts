import {injectable, inject} from "inversify";
import {FileSystem, Path} from "../../filesystem/common";
import {TheiaApplication, TheiaPlugin, IOpenerService} from "../../application/browser";
import {EditorWidget} from "./editor-widget";
import Uri = monaco.Uri;

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
        return this.fileSystem.readFile(path, 'UTF-8').then(value => {
            const uri = Uri.file(key);
            const model = monaco.editor.createModel(value, undefined, uri);
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

}
