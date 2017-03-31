import { IOpenerService, TheiaPlugin } from '../../application/browser';
import { SelectionService } from '../../application/common/selection-service';
import { CommandContribution, CommandRegistry } from '../../application/common/command';
import { CommonCommands } from '../../application/common/commands-common';
import { MenuContribution, MenuModelRegistry } from '../../application/common/menu';
import { EditorCommandHandler } from './editor-command';
import { EditorManager, IEditorManager } from './editor-manager';
import { EditorRegistry } from './editor-registry';
import { EditorService } from './editor-service';
import { TextModelResolverService } from './model-resolver-service';
import { ContainerModule, inject, injectable } from 'inversify';

export const EDITOR_CONTEXT = 'editor_context_menu';

@injectable()
export class EditorCommandHandlers implements CommandContribution {
    constructor(@inject(IEditorManager) private editorService: IEditorManager,
                @inject(SelectionService) private selectionService: SelectionService) {}

    contribute(registry: CommandRegistry) {
        registry.registerHandler(
            CommonCommands.EDIT_CUT,
            new EditorCommandHandler(this.editorService, this.selectionService, {
                id: CommonCommands.EDIT_CUT,
                actionId: 'editor.action.clipboardCutAction'
            }));
        registry.registerHandler(
            CommonCommands.EDIT_COPY,
            new EditorCommandHandler(this.editorService, this.selectionService, {
                id: CommonCommands.EDIT_COPY,
                actionId: 'editor.action.clipboardCopyAction'
            }));
        registry.registerHandler(
            CommonCommands.EDIT_PASTE,
            new EditorCommandHandler(this.editorService, this.selectionService, {
                id: CommonCommands.EDIT_PASTE,
                actionId: 'editor.action.clipboardPasteAction'
            }));
        registry.registerHandler(
            CommonCommands.EDIT_UNDO,
            new EditorCommandHandler(this.editorService, this.selectionService, {
                id: CommonCommands.EDIT_UNDO,
                actionId: 'undo'
            }));
        registry.registerHandler(
            CommonCommands.EDIT_REDO,
            new EditorCommandHandler(this.editorService, this.selectionService, {
                id: CommonCommands.EDIT_REDO,
                actionId: 'redo'
            }));
    }
}

@injectable()
export class EditorMenuContribution implements MenuContribution {
    contribute(registry: MenuModelRegistry) {
        // Explicitly register the Edit Submenu
        registry.registerMenuAction([EDITOR_CONTEXT, "1_undo/redo"], {
            commandId: CommonCommands.EDIT_UNDO
        });
        registry.registerMenuAction([EDITOR_CONTEXT, "1_undo/redo"], {
            commandId: CommonCommands.EDIT_REDO
        });
        registry.registerMenuAction([EDITOR_CONTEXT, "2_copy"], {
            commandId: CommonCommands.EDIT_CUT
        });
        registry.registerMenuAction([EDITOR_CONTEXT, "2_copy"], {
            commandId: CommonCommands.EDIT_COPY
        });
        registry.registerMenuAction([EDITOR_CONTEXT, "2_copy"], {
            commandId: CommonCommands.EDIT_PASTE
        });
    }
}

export const editorModule = new ContainerModule(bind => {
    bind(EditorRegistry).toSelf().inSingletonScope();
    bind(EditorService).toSelf().inSingletonScope();
    bind(TextModelResolverService).toSelf().inSingletonScope();
    bind(IEditorManager).to(EditorManager).inSingletonScope();
    bind(TheiaPlugin).toDynamicValue(context => context.container.get(IEditorManager));
    bind(IOpenerService).toDynamicValue(context => context.container.get(IEditorManager));
    bind<CommandContribution>(CommandContribution).to(EditorCommandHandlers);
    bind<MenuContribution>(MenuContribution).to(EditorMenuContribution);
});
