import { IOpenerService, TheiaApplication, TheiaPlugin } from "../../application/browser";
import { FileSystem, Path } from "../../filesystem/common";
import { EditorWidget } from "./editor-widget";
import { inject, injectable } from "inversify";
import { DisposableCollection, Disposable, Event, Emitter } from "../../application/common";
import Uri = monaco.Uri;
import IModel = monaco.editor.IModel;

export const IEditorService = Symbol("IEditorService");

export interface IEditorService extends IOpenerService, TheiaPlugin {
    /**
     * All opened editors.
     */
    readonly editors: EditorWidget[];
    /**
     * Emit when editors changed.
     */
    readonly onEditorsChanged: Event<void>;
    /**
     * Open an editor for the given path.
     * Undefined if the given path is not of Path type.
     */
    open(path: Path | any): Promise<EditorWidget> | undefined;
    /**
     * The most recently focused editor.
     */
    readonly currentEditor: EditorWidget | undefined;
    /**
     * Emit when the current editor changed.
     */
    readonly onCurrentEditorChanged: Event<EditorWidget | undefined>;
    /**
     * The currently focused editor.
     */
    readonly activeEditor: EditorWidget | undefined;
    /**
     * Emit when the active editor changed.
     */
    readonly onActiveEditorChanged: Event<EditorWidget | undefined>;
}

// FIXME should implement monaco editor service as well
@injectable()
export class EditorService implements IEditorService {

    protected readonly model = new EditorService.Model();
    protected readonly currentObserver = new EditorService.Observer('current');
    protected readonly activeObserver = new EditorService.Observer('active');

    protected app: TheiaApplication | undefined;

    constructor(@inject(FileSystem) protected readonly fileSystem: FileSystem) {
    }

    get editors() {
        return this.model.getOpenedEditors();
    }

    get onEditorsChanged() {
        return this.model.onEditorsChanged();
    }

    get currentEditor() {
        return this.currentObserver.getEditor();
    }

    get onCurrentEditorChanged() {
        return this.currentObserver.onEditorChanged();
    }

    get activeEditor() {
        return this.activeObserver.getEditor();
    }

    get onActiveEditorChanged() {
        return this.activeObserver.onEditorChanged();
    }

    onStart(app: TheiaApplication): void {
        this.app = app;
        this.currentObserver.onStart(app);
        this.activeObserver.onStart(app);
    }

    open(path: Path | any): Promise<EditorWidget> | undefined {
        const app = this.app;
        if (!app || !(path instanceof Path)) {
            return undefined;
        }
        const key = path.toString();
        const deferredEditor = this.model.getEditor(key);
        if (deferredEditor) {
            return Promise.resolve(deferredEditor).then(editor => {
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
            editor.id = `editor-${this.model.getEditorCount()}`;
            editor.title.label = path.simpleName || 'Unknown';
            editor.title.closable = true;
            this.model.addEditor(key, editor);
            editor.disposed.connect(() => {
                // FIXME provide model manager: (1) reference counting, (2) notifications, (3) content synchronization
                model.dispose();
                this.model.removeEditor(key);
            });
            app.shell.addToMainArea(editor);
            app.shell.activateMain(editor.id);
            return editor;
        }, (reason) => {
            this.model.removeEditor(key);
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

export namespace EditorService {
    export type DeferredEditor = Promise<EditorWidget> | EditorWidget;
    export class Model {
        protected readonly editors = new Map<string, DeferredEditor | undefined>();
        protected readonly onEditorsChangedEmitter = new Emitter<void>();

        onEditorsChanged() {
            return this.onEditorsChangedEmitter.event;
        }

        getEditorCount(): number  {
            return this.editors.size;
        }

        getOpenedEditors(): EditorWidget[] {
            return Array.from(this.editors.values()).filter(editor => editor instanceof EditorWidget) as EditorWidget[];
        }

        getAllEditors(): DeferredEditor[] {
            return Array.from(this.editors.values()).filter(editor => !!editor) as DeferredEditor[];
        }

        getEditor(path: string): DeferredEditor |  undefined  {
            return this.editors.get(path);
        }

        addEditor(path: string, editor: EditorWidget): void {
            this.editors.set(path, editor);
            this.onEditorsChangedEmitter.fire(undefined);
        }

        removeEditor(path: string): void {
            if (this.editors.delete(path)) {
                this.onEditorsChangedEmitter.fire(undefined);
            }
        }
    }
    export class Observer {
        protected app: TheiaApplication |  undefined;
        protected readonly onEditorChangedEmitter = new Emitter<EditorWidget | undefined>();

        constructor(protected readonly kind: 'current' | 'active') {
        }

        onStart(app: TheiaApplication) {
            this.app = app;
            const key = this.kind === 'current' ? 'currentChanged' : 'activeChanged';
            app.shell[key].connect((shell, arg) => {
                if (arg.newValue instanceof EditorWidget || arg.oldValue instanceof EditorWidget) {
                    this.onEditorChangedEmitter.fire(this.getEditor());
                }
            });
        }

        getEditor(): EditorWidget | undefined {
            if (this.app) {
                const key = this.kind === 'current' ? 'currentWidget' : 'activeWidget';
                const widget = this.app.shell[key];
                if (widget instanceof EditorWidget) {
                    return widget;
                }
            }
        }

        onEditorChanged() {
            return this.onEditorChangedEmitter.event;
        }
    }
}
