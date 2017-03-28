import { Command } from '../../application/common/command';
import { SelectionService } from '../../application/common';
import { IEditorManager } from './editor-manager';
export import ICursorSelectionChangedEvent = monaco.editor.ICursorSelectionChangedEvent;


export class EditorCommand implements Command {
    constructor(protected readonly editorManager: IEditorManager,
                protected readonly selectionService: SelectionService,
                protected readonly options: EditorCommand.Options) {
    }

    get id(): string {
        return this.options.id;
    }

    execute(arg?: any): Promise<any> {
        const currentEditor = this.editorManager.currentEditor;
        if (currentEditor) {
            currentEditor.runAction(this.options.actionId);
        }
        return Promise.resolve();
    }

    get label(): string {
        return this.options.label;
    }

    get iconClass(): string {
        return this.options.iconClass ? this.options.iconClass : '';
    }

    isVisible(arg?: any): boolean {
        return isEditorSelection(this.selectionService.selection);
    }

    isEnabled(arg?: any): boolean {
        const currentEditor = this.editorManager.currentEditor;
        return !!currentEditor && currentEditor.isActionSupported(this.options.actionId);
    }

}

export function isEditorSelection(e: any): e is ICursorSelectionChangedEvent {
    return e && e["selection"] instanceof monaco.Selection && typeof e["source"] === 'string'
}

export namespace EditorCommand {
    export interface Options {
        id: string;
        label: string;
        iconClass?: string;
        actionId: string
    }
}
