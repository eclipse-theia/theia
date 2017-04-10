import { IOpenerService, TheiaPlugin } from '../../application/browser';
import { SelectionService } from '../../application/common/selection-service';
import { CommandContribution, CommandRegistry, CommandHandler } from '../../application/common/command';
import { CommonCommands } from '../../application/common/commands-common';
import { MenuContribution, MenuModelRegistry } from '../../application/common/menu';
import { EditorCommandHandler } from './editor-command';
import { EditorManager, IEditorManager } from './editor-manager';
import { EditorRegistry } from './editor-registry';
import { EditorService } from './editor-service';
import { TextModelResolverService } from './model-resolver-service';
import { ContainerModule, inject, injectable } from 'inversify';
import { BrowserContextMenuService, EditorContextMenuService, EDITOR_CONTEXT_MENU_ID } from './editor-contextmenu';
import CommandsRegistry = monaco.commands.CommandsRegistry;
import MenuRegistry = monaco.actions.MenuRegistry;
import MenuId = monaco.actions.MenuId;
import ICommand = monaco.commands.ICommand;
import IMenuItem = monaco.actions.IMenuItem;

@injectable()
export class EditorCommandHandlers implements CommandContribution {

    constructor( @inject(IEditorManager) private editorService: IEditorManager,
        @inject(SelectionService) private selectionService: SelectionService) { }

    contribute(registry: CommandRegistry) {
        registry.registerHandler(
            CommonCommands.EDIT_CUT,
            this.newHandler({
                id: CommonCommands.EDIT_CUT,
                actionId: 'editor.action.clipboardCutAction'
            }));
        registry.registerHandler(
            CommonCommands.EDIT_COPY,
            this.newHandler({
                id: CommonCommands.EDIT_COPY,
                actionId: 'editor.action.clipboardCopyAction'
            }));
        registry.registerHandler(
            CommonCommands.EDIT_PASTE,
            this.newHandler({
                id: CommonCommands.EDIT_PASTE,
                actionId: 'editor.action.clipboardPasteAction'
            }));
        registry.registerHandler(
            CommonCommands.EDIT_UNDO,
            this.newHandler({
                id: CommonCommands.EDIT_UNDO,
                actionId: 'undo'
            }));
        registry.registerHandler(
            CommonCommands.EDIT_REDO,
            this.newHandler({
                id: CommonCommands.EDIT_REDO,
                actionId: 'redo'
            }));

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
                this.newHandler({
                    id,
                    actionId: id
                })
            );
        });

    }

    private newHandler(options: EditorCommandHandler.Options): CommandHandler {
        return new EditorCommandHandler(this.editorService, this.selectionService, options);
    }

}

@injectable()
export class EditorMenuContribution implements MenuContribution {
    contribute(registry: MenuModelRegistry) {
        // Explicitly register the Edit Submenu
        registry.registerMenuAction([EDITOR_CONTEXT_MENU_ID, "1_undo/redo"], {
            commandId: CommonCommands.EDIT_UNDO
        });
        registry.registerMenuAction([EDITOR_CONTEXT_MENU_ID, "1_undo/redo"], {
            commandId: CommonCommands.EDIT_REDO
        });
        registry.registerMenuAction([EDITOR_CONTEXT_MENU_ID, "2_copy"], {
            commandId: CommonCommands.EDIT_CUT
        });
        registry.registerMenuAction([EDITOR_CONTEXT_MENU_ID, "2_copy"], {
            commandId: CommonCommands.EDIT_COPY
        });
        registry.registerMenuAction([EDITOR_CONTEXT_MENU_ID, "2_copy"], {
            commandId: CommonCommands.EDIT_PASTE
        });

        const wrap: (item: IMenuItem) => { path: string[], commandId: string } = (item) => {
            return { path: [EDITOR_CONTEXT_MENU_ID, (item.group || "")], commandId: item.command.id }
        };

        MenuRegistry.getMenuItems(MenuId.EditorContext)
            .map(item => wrap(item))
            .forEach(props => registry.registerMenuAction(props.path, { commandId: props.commandId }));

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
});
