import {injectable} from "inversify";
import {EditorWidget} from "./editor-widget";
import {Emitter, Event} from "../../application/common";

@injectable()
export class EditorRegistry {
    protected readonly editors = new Map<string, monaco.Promise<EditorWidget> | EditorWidget | undefined>();
    protected readonly onEditorsChangedEmitter = new Emitter<void>();

    onEditorsChanged(): Event<void> {
        return this.onEditorsChangedEmitter.event;
    }

    getEditorCount(): number {
        return this.editors.size;
    }

    getOpenedEditors(): EditorWidget[] {
        return Array.from(this.editors.values()).filter(editor => editor instanceof EditorWidget) as EditorWidget[];
    }

    getEditor(key: string): monaco.Promise<EditorWidget> | undefined {
        const editor = this.editors.get(key);
        if (editor) {
            return monaco.Promise.wrap(editor);
        }
    }

    addEditor(key: string, editor: EditorWidget): void {
        editor.id = `editor-${this.getEditorCount()}`;
        this.editors.set(key, editor);
        this.onEditorsChangedEmitter.fire(undefined);
    }

    removeEditor(key: string): void {
        if (this.editors.delete(key)) {
            this.onEditorsChangedEmitter.fire(undefined);
        }
    }
}
