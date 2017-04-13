import { IOpenerService, TheiaPlugin } from '../../application/browser';
import { SelectionService } from '../../application/common/selection-service';
import { CommandContribution, CommandRegistry, CommandHandler } from '../../application/common/command';
import { CommonCommands } from '../../application/common/commands-common';
import { MenuContribution, MenuModelRegistry } from '../../application/common/menu';
import { EditorCommandHandler, TextModificationEditorCommandHandler } from './editor-command';
import { EditorManager, IEditorManager } from './editor-manager';
import { EditorRegistry } from './editor-registry';
import { EditorService } from './editor-service';
import { TextModelResolverService } from './model-resolver-service';
import { EditorWidget } from './editor-widget';
import { ContainerModule, inject, injectable } from 'inversify';
import { Keybinding, KeybindingContribution } from '../../application/common/keybinding';
import { BrowserContextMenuService, EditorContextMenuService, EDITOR_CONTEXT_MENU_ID } from './editor-contextmenu';
import CommandsRegistry = monaco.commands.CommandsRegistry;
import MenuRegistry = monaco.actions.MenuRegistry;
import MenuId = monaco.actions.MenuId;
import ICommand = monaco.commands.ICommand;
import IMenuItem = monaco.actions.IMenuItem;
import KeybindingsRegistry = monaco.keybindings.KeybindingsRegistry;

@injectable()
class EditorCommandHandlers implements CommandContribution {

    constructor(
        @inject(IEditorManager) private editorService: IEditorManager,
        @inject(SelectionService) private selectionService: SelectionService) {

    }

    contribute(registry: CommandRegistry) {

        [CommonCommands.EDIT_UNDO, CommonCommands.EDIT_REDO].forEach(id => {
            const doExecute = (editorWidget: EditorWidget, ...args: any[]): any => {
                return editorWidget.getControl().trigger('keyboard', id, args);
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

@injectable()
class EditorMenuContribution implements MenuContribution {
    contribute(registry: MenuModelRegistry) {
        // Explicitly register the Edit Submenu
        registry.registerMenuAction([EDITOR_CONTEXT_MENU_ID, "1_undo/redo"], {
            commandId: CommonCommands.EDIT_UNDO
        });
        registry.registerMenuAction([EDITOR_CONTEXT_MENU_ID, "1_undo/redo"], {
            commandId: CommonCommands.EDIT_REDO
        });

        const wrap: (item: IMenuItem) => { path: string[], commandId: string } = (item) => {
            return { path: [EDITOR_CONTEXT_MENU_ID, (item.group || "")], commandId: item.command.id };
        };

        MenuRegistry.getMenuItems(MenuId.EditorContext)
            .map(item => wrap(item))
            .forEach(props => registry.registerMenuAction(props.path, { commandId: props.commandId }));
    }
}

@injectable()
class EditorKeybindingContribution implements KeybindingContribution {
    getKeybindings(): Keybinding[] {
        const ids = MenuRegistry.getMenuItems(MenuId.EditorContext).map(item => item.command.id);
        return KeybindingsRegistry.getDefaultKeybindings().filter(kb => ids.indexOf(kb.command) >= 0).map(kb => {
            return {
                commandId: kb.command,
                keyCode: kb.keybinding
            }
        });
    }
}

export const editorModule = new ContainerModule(bind => {
    bind(EditorRegistry).toSelf().inSingletonScope();
    bind<EditorContextMenuService>(EditorContextMenuService).to(BrowserContextMenuService).inSingletonScope();
    bind(EditorService).toSelf().inSingletonScope();
    bind(TextModelResolverService).toSelf().inSingletonScope();
    bind(IEditorManager).to(EditorManager).inSingletonScope();
    bind(TheiaPlugin).toDynamicValue(context => context.container.get(IEditorManager));
    bind(IOpenerService).toDynamicValue(context => context.container.get(IEditorManager));
    bind<CommandContribution>(CommandContribution).to(EditorCommandHandlers);
    bind<MenuContribution>(MenuContribution).to(EditorMenuContribution);
    bind<KeybindingContribution>(KeybindingContribution).to(EditorKeybindingContribution);
});
