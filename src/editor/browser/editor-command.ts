import { Command } from '../../application/common/command';
import { IEditorManager } from './editor-manager';

export class EditorCommand implements Command {
    constructor(protected readonly editorManager: IEditorManager,
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

    label(arg?: any): string {
        return this.options.label;
    }

    iconClass(arg?: any): string {
        return this.options.iconClass ? this.options.iconClass : '';
    }

    isVisible(arg?: any): boolean {
        return true;
    }

    isEnabled(arg?: any): boolean {
        const currentEditor = this.editorManager.currentEditor;
        return !!currentEditor && currentEditor.isActionSupported(this.options.actionId);
    }

}

export namespace EditorCommand {
    export interface Options {
        id: string;
        label: string;
        iconClass?: string;
        actionId: string;
    }
}
