import { CommandHandler } from '../../application/common/command';
import { SelectionService } from '../../application/common';
import { IEditorManager } from './editor-manager';
import { EditorWidget } from './editor-widget';
import ICursorSelectionChangedEvent = monaco.editor.ICursorSelectionChangedEvent;


export class EditorCommandHandler implements CommandHandler {

    constructor(protected readonly editorManager: IEditorManager,
        protected readonly selectionService: SelectionService,
        protected readonly id: string) {
    }

    execute(arg?: any): Promise<any> {
        const currentEditor = this.editorManager.currentEditor;
        if (currentEditor) {
            currentEditor.runAction(this.id);
        }
        return Promise.resolve();
    }

    isVisible(arg?: any): boolean {
        return isEditorSelection(this.selectionService.selection);
    }

    isEnabled(arg?: any): boolean {
        const currentEditor = this.editorManager.currentEditor;
        return !!currentEditor && currentEditor.isActionSupported(this.id);
    }

}

export class ClipboardEditorCommandHandler extends EditorCommandHandler {

    constructor(editorManager: IEditorManager,
        selectionService: SelectionService,
        id: string,
        private handlerId: string,
        private commandArgs: (editorWidget: EditorWidget | undefined) => any[]) {
            super(editorManager, selectionService, id);
        }

    isEnabled(arg?: any): boolean {
        return !!this.editorManager.currentEditor;
    }

    execute(arg?: any): Promise<any> {
        const currentEditor = this.editorManager.currentEditor;
        if (currentEditor) {
            return new Promise<any>((resolve, reject) => {
                currentEditor.getControl().focus();
                resolve(currentEditor.getControl()._commandService.executeCommand(this.handlerId, this.commandArgs(currentEditor)));
            });
        }
        return Promise.resolve();
    }

}

export function isEditorSelection(e: any): e is ICursorSelectionChangedEvent {
    return e && e["selection"] instanceof monaco.Selection && typeof e["source"] === 'string'
}
