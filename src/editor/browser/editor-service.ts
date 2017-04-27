import { TheiaApplication } from '../../application/browser';
import { SelectionService } from '../../application/common';
import { EditorRegistry } from './editor-registry';
import { EditorWidget } from './editor-widget';
import { TextModelResolverService } from './model-resolver-service';
import { injectable, inject } from 'inversify';
import { EditorContextMenuService } from './editor-contextmenu';
import URI from "../../application/common/uri";
import IEditorService = monaco.editor.IEditorService;
import IResourceInput = monaco.editor.IResourceInput;
import IResourceInputOptions = monaco.editor.IResourceInputOptions;
import Uri = monaco.Uri;

@injectable()
export class EditorService implements IEditorService {

    protected app: TheiaApplication | undefined;

    constructor(protected readonly editorRegistry: EditorRegistry,
        protected readonly textModelResolverService: TextModelResolverService,
        @inject(SelectionService) protected readonly selectionService: SelectionService,
        @inject(EditorContextMenuService) protected readonly contextMenuService: EditorContextMenuService) {
    }

    onStart(app: TheiaApplication): void {
        this.app = app;
    }

    openEditor(input: IResourceInput, sideBySide?: boolean | undefined): monaco.Promise<EditorWidget | undefined> {
        return this.getOrCreateEditor(input, sideBySide).then(editor => {
            this.prepare(editor, input.options);
            return editor;
        });
    }

    protected getOrCreateEditor(input: IResourceInput, sideBySide?: boolean | undefined): monaco.Promise<EditorWidget | undefined> {
        const app = this.app;
        if (!app) {
            return monaco.Promise.as(undefined);
        }
        const key = input.resource.toString();
        const editor = this.editorRegistry.getEditor(key);
        if (editor) {
            return editor;
        }
        return this.createEditor(input.resource).then(editor => {
            this.editorRegistry.addEditor(key, editor);
            editor.disposed.connect(() => this.editorRegistry.removeEditor(key));
            app.shell.addToMainArea(editor);
            return editor;
        });
    }

    protected createEditor(uri: Uri): monaco.Promise<EditorWidget> {
        return this.textModelResolverService.createModelReference(uri).then(reference => {
            const editor = new EditorWidget({
                model: reference.object.textEditorModel,
                wordWrap: true,
                folding: true,
                theme: 'vs-dark'
            }, {
                    editorService: this,
                    textModelResolverService: this.textModelResolverService,
                    contextMenuService: this.contextMenuService
                }, this.selectionService);
            editor.disposed.connect(() => reference.dispose());
            editor.title.closable = true;
            return editor
        });
    }

    protected prepare(widget: EditorWidget | undefined, options: IResourceInputOptions | undefined): monaco.Promise<void> {
        if (widget) {
            widget.title.label = new URI(widget.getControl().getModel().uri.toString()).lastSegment();
            this.reveal(widget, options);
            this.revealSelection(widget, options);
        }
        return monaco.Promise.as(undefined);
    }

    protected reveal(widget: EditorWidget, options: IResourceInputOptions | undefined): void {
        if (options === undefined || options.revealIfVisible === undefined || options.revealIfVisible) {
            if (this.app) {
                this.app.shell.activateMain(widget.id);
            }
        }
    }

    protected revealSelection(editorWidget: EditorWidget, options: IResourceInputOptions | undefined): void {
        if (options && options.selection) {
            const editor = editorWidget.getControl();
            const selection = this.getSelection(editor, options.selection);
            if (monaco.Position.isIPosition(selection)) {
                editor.setPosition(selection);
                editor.revealPositionInCenter(selection);
            } else if (monaco.Range.isIRange(selection)) {
                editor.setSelection(selection);
                editor.revealRangeInCenter(selection);
            }
        }
    }

    protected getSelection(editor: monaco.editor.IStandaloneCodeEditor, selection: Partial<monaco.IRange>): monaco.IRange | monaco.IPosition | undefined {
        if (typeof selection.startLineNumber === 'number' && typeof selection.startColumn === 'number') {
            if (typeof selection.endLineNumber === 'number') {
                if (typeof selection.endColumn === 'number') {
                    return selection as monaco.IRange;
                }
                return undefined;
            }
            return <monaco.IPosition>{
                lineNumber: selection.startLineNumber,
                column: selection.startColumn
            };
        }
        return undefined;
    }

}
