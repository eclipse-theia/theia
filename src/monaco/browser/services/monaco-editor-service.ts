import { injectable, inject } from 'inversify';
import { OpenerService } from '../../../application/browser';
import { EditorInput, EditorWidget } from '../../../editor/browser';
import { MonacoToProtocolConverter } from '../languages';

import IEditorService = monaco.editor.IEditorService;
import IResourceInput = monaco.editor.IResourceInput;
import IEditorReference = monaco.editor.IEditorReference;

@injectable()
export class MonacoEditorService implements IEditorService {

    constructor(
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(MonacoToProtocolConverter) protected readonly m2p: MonacoToProtocolConverter
    ) { }

    openEditor(input: IResourceInput, sideBySide?: boolean | undefined): monaco.Promise<IEditorReference | undefined> {
        const uri = input.resource.toString();
        const revealIfVisible = !input.options || input.options.revealIfVisible === undefined || input.options.revealIfVisible;
        const selection = !input.options ? undefined : this.m2p.asRange(input.options.selection);
        const open = this.openerService.open<EditorInput, EditorWidget>({
            uri,
            revealIfVisible,
            selection
        });
        if (open) {
            return monaco.Promise.wrap(open.then(widget => {
                const editor = widget.editor;
                if (this.isEditorReference(editor)) {
                    return editor;
                }
                return undefined;
            }));
        }
        return monaco.Promise.wrap(undefined);
    }

    protected isEditorReference(editor: any): editor is IEditorReference {
        return 'getControl' in editor;
    }

}
