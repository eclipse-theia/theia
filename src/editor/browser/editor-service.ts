import {injectable} from "inversify";
import {EditorWidget} from "./editor-widget";
import {TextModelResolverService} from "./model-resolver-service";
import {TheiaApplication} from "../../application/browser";
import {EditorRegistry} from "./editor-registry";
import IEditorService = monaco.editor.IEditorService;
import IResourceInput = monaco.editor.IResourceInput;
import Uri = monaco.Uri;

@injectable()
export class EditorService implements IEditorService {

    protected app: TheiaApplication | undefined;

    constructor(protected readonly editorRegistry: EditorRegistry,
                protected readonly textModelResolverService: TextModelResolverService) {
    }

    onStart(app: TheiaApplication): void {
        this.app = app;
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
                folding: true
            }, {
                editorService: this,
                textModelResolverService: this.textModelResolverService
            });
            editor.disposed.connect(() => reference.dispose());
            editor.title.closable = true;
            return editor
        });
    }

}
