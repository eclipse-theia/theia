import {injectable} from "inversify";
import {IOpenerService, TheiaApplication, TheiaPlugin} from "../../application/browser";
import {EditorWidget} from "./editor-widget";
import {Event, Emitter} from "../../application/common";
import {EditorService} from "./editor-service";
import { EditorRegistry } from "./editor-registry";
import Uri = monaco.Uri;

export const IEditorManager = Symbol("IEditorManager");

export interface IEditorManager extends IOpenerService, TheiaPlugin {
    /**
     * All opened editors.
     */
    readonly editors: EditorWidget[];
    /**
     * Emit when editors changed.
     */
    readonly onEditorsChanged: Event<void>;
    /**
     * Open an editor for the given uri.
     * Undefined if the given uri is not of Path type.
     * Resolve to undefined if an editor cannot be opened.
     */
    open(uri: string): Promise<EditorWidget | undefined> | undefined;
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

@injectable()
export class EditorManager implements IEditorManager {

    protected readonly currentObserver = new EditorManager.Observer('current');
    protected readonly activeObserver = new EditorManager.Observer('active');

    protected app: TheiaApplication | undefined;

    constructor(protected readonly editorRegistry: EditorRegistry,
                protected readonly editorService: EditorService) {
    }

    onStart(app: TheiaApplication): void {
        this.app = app;
        this.currentObserver.onStart(app);
        this.activeObserver.onStart(app);
        this.editorService.onStart(app);
    }

    get editors() {
        return this.editorRegistry.getOpenedEditors();
    }

    get onEditorsChanged() {
        return this.editorRegistry.onEditorsChanged();
    }

    open(uri: string): Promise<EditorWidget> | undefined {
        const resource = Uri.parse(uri);
        return Promise.resolve(this.editorService.openEditor({resource}));
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

}

export namespace EditorManager {
    export class Observer {
        protected app: TheiaApplication | undefined;
        protected readonly onEditorChangedEmitter = new Emitter<EditorWidget | undefined>();

        constructor(protected readonly kind: 'current' | 'active') {
        }

        onStart(app: TheiaApplication) {
            this.app = app;
            const key = this.kind === 'current' ? 'currentChanged' : 'activeChanged';
            app.shell[key].connect((shell, arg) => {
                if (arg.newValue instanceof EditorWidget || arg.oldValue instanceof EditorWidget) {
                    this.onEditorChangedEmitter.fire(this.getEditor());
                }
            });
        }

        getEditor(): EditorWidget | undefined {
            if (this.app) {
                const key = this.kind === 'current' ? 'currentWidget' : 'activeWidget';
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
