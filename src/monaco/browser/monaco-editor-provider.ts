import { injectable, inject } from 'inversify';
import { SelectionService } from "../../application/common";
import { TextEditorProvider } from "../../editor/browser";
import { MonacoEditorService, MonacoModelResolver, MonacoContextMenuService } from './services';
import { MonacoToProtocolConverter, ProtocolToMonacoConverter, MonacoWorkspace } from './languages';
import { MonacoEditor } from "./monaco-editor";

@injectable()
export class MonacoEditorProvider implements TextEditorProvider {

    constructor(
        @inject(MonacoEditorService) protected readonly editorService: MonacoEditorService,
        @inject(MonacoModelResolver) protected readonly monacoModelResolver: MonacoModelResolver,
        @inject(MonacoContextMenuService) protected readonly contextMenuService: MonacoContextMenuService,
        @inject(MonacoToProtocolConverter) protected readonly m2p: MonacoToProtocolConverter,
        @inject(ProtocolToMonacoConverter) protected readonly p2m: ProtocolToMonacoConverter,
        @inject(MonacoWorkspace) protected readonly workspace: MonacoWorkspace,
        @inject(SelectionService) protected readonly selectionService: SelectionService
    ) { }

    get(raw: string): Promise<MonacoEditor> {
        const uri = monaco.Uri.parse(raw);
        return Promise.resolve(this.monacoModelResolver.createModelReference(uri).then(reference => {
            const node = document.createElement('div');
            const editor = new MonacoEditor(
                node, this.m2p, this.p2m, this.workspace, this.selectionService, {
                    model: reference.object.textEditorModel,
                    wordWrap: true,
                    folding: true,
                    theme: 'vs-dark'
                }, {
                    editorService: this.editorService,
                    textModelResolverService: this.monacoModelResolver,
                    contextMenuService: this.contextMenuService
                }
            );
            editor.toDispose.push(reference);
            return editor;
        }));
    }

}