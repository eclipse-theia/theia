import { injectable, inject } from "inversify";
import {
    CommandHandler, CommandContribution, CommandRegistry, CommonCommands, SelectionService
} from '../../application/common';
import { EditorManager, EditorWidget } from "../../editor/browser";
import { MonacoEditor } from "./monaco-editor";
import CommandsRegistry = monaco.commands.CommandsRegistry;
import MenuRegistry = monaco.actions.MenuRegistry;
import MenuId = monaco.actions.MenuId;
import ICommand = monaco.commands.ICommand;
import IMenuItem = monaco.actions.IMenuItem;
import ICursorSelectionChangedEvent = monaco.editor.ICursorSelectionChangedEvent;

@injectable()
export class MonacoEditorCommandHandlers implements CommandContribution {

    constructor(
        @inject(EditorManager) private editorService: EditorManager,
        @inject(SelectionService) private selectionService: SelectionService) {

    }

    contribute(registry: CommandRegistry) {
        [CommonCommands.EDIT_UNDO, CommonCommands.EDIT_REDO].forEach(id => {
            const doExecute = (editorWidget: EditorWidget, ...args: any[]): any => {
                const editor = editorWidget.editor;
                if (editor instanceof MonacoEditor) {
                    return editor.getControl().trigger('keyboard', id, args);
                }
            };
            const handler = this.newClipboardHandler(id, doExecute);
            registry.registerHandler(id, handler);
        });

        MenuRegistry.getMenuItems(MenuId.EditorContext).map(item => item.command).forEach(command => {
            registry.registerCommand({
                id: command.id,
                label: command.title,
                iconClass: command.iconClass
            });
        });

        const findCommand: (item: IMenuItem) => ICommand = (item) => CommandsRegistry.getCommand(item.command.id);
        const wrap: (item: IMenuItem, command: ICommand) => { item: IMenuItem, command: ICommand } = (item, command) => {
            return { item, command }
        }

        MenuRegistry.getMenuItems(MenuId.EditorContext).map(item => wrap(item, findCommand(item))).forEach(props => {
            const id = props.item.command.id;
            registry.registerHandler(
                id,
                this.newHandler(id)
            );
        });
    }

    private newHandler(id: string): CommandHandler {
        return new EditorCommandHandler(this.editorService, this.selectionService, id);
    }

    private newClipboardHandler(id: string, doExecute: (editorWidget: EditorWidget, ...args: any[]) => any) {
        const commandArgs = (widget: EditorWidget) => [{}];
        return new TextModificationEditorCommandHandler(this.editorService, this.selectionService, id, commandArgs, doExecute);
    }

}

export class EditorCommandHandler implements CommandHandler {

    constructor(
        protected readonly editorManager: EditorManager,
        protected readonly selectionService: SelectionService,
        protected readonly id: string
    ) { }

    execute(arg?: any): Promise<any> {
        const currentEditor = this.editorManager.currentEditor;
        if (currentEditor && currentEditor.editor instanceof MonacoEditor) {
            currentEditor.editor.runAction(this.id);
        }
        return Promise.resolve();
    }

    isVisible(arg?: any): boolean {
        return isEditorSelection(this.selectionService.selection);
    }

    isEnabled(arg?: any): boolean {
        const currentEditor = this.editorManager.currentEditor;
        return !!currentEditor &&
            currentEditor.editor instanceof MonacoEditor &&
            currentEditor.editor.isActionSupported(this.id);
    }

}

export class TextModificationEditorCommandHandler extends EditorCommandHandler {

    constructor(editorManager: EditorManager,
        selectionService: SelectionService,
        id: string,
        private commandArgs: (widget: EditorWidget | undefined) => any[],
        private doExecute: (widget: EditorWidget | undefined, ...args: any[]) => any) {
        super(editorManager, selectionService, id);
    }

    isEnabled(arg?: any): boolean {
        return !!this.editorManager.currentEditor;
    }

    execute(arg?: any): Promise<any> {
        const currentEditor = this.editorManager.currentEditor;
        if (currentEditor) {
            return new Promise<any>((resolve, reject) => {
                currentEditor.editor.focus();
                resolve(this.doExecute(currentEditor, this.commandArgs(currentEditor)));
            });
        }
        return Promise.resolve();
    }

}

export function isEditorSelection(e: any): e is ICursorSelectionChangedEvent {
    return e && e["selection"] instanceof monaco.Selection && typeof e["source"] === 'string'
}
