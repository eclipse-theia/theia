import { TheiaApplication } from '../../application/browser';
import { SelectionService } from '../../application/common';
import { EditorRegistry } from './editor-registry';
import { EditorWidget } from './editor-widget';
import { TextModelResolverService } from './model-resolver-service';
import { injectable, inject } from 'inversify';
import { EditorContextMenuService } from './editor-contextmenu';
import IEditorService = monaco.editor.IEditorService;
import IResourceInput = monaco.editor.IResourceInput;
import Uri = monaco.Uri;

@injectable()
export class EditorService implements IEditorService {

    protected app: TheiaApplication | undefined;
    protected contextMenuService: any | undefined;

    constructor(protected readonly editorRegistry: EditorRegistry,
                protected readonly textModelResolverService: TextModelResolverService,
                @inject(SelectionService) protected readonly selectionService: SelectionService) {
    }

    onStart(app: TheiaApplication): void {
        this.app = app;
        this.contextMenuService = this.app.getService(EditorContextMenuService);
    }

    openEditor(input: IResourceInput, sideBySide?: boolean | undefined): monaco.Promise<EditorWidget | undefined> {
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

}
