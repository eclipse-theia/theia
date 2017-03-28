import { IOpenerService, TheiaPlugin } from '../../application/browser';
import { SelectionService } from '../../application/common/selection-service';
import { CommandContribution } from '../../application/common/command';
import { MAIN_MENU_BAR, MenuContribution } from '../../application/common/menu';
import { EditorCommand } from './editor-command';
import { EditorManager, IEditorManager } from './editor-manager';
import { EditorRegistry } from './editor-registry';
import { EditorService } from './editor-service';
import { TextModelResolverService } from './model-resolver-service';
import { ContainerModule, inject, injectable } from 'inversify';

@injectable()
class EditorCommands implements CommandContribution {
    constructor(@inject(IEditorManager) private editorService: IEditorManager,
                @inject(SelectionService) private selectionService: SelectionService) {}

    getCommands() {
        return [
            new EditorCommand(this.editorService, this.selectionService, {
                id: 'edit:cut',
                label: 'Cut',
                actionId: 'editor.action.clipboardCutAction'
            }),
            new EditorCommand(this.editorService, this.selectionService, {
                id: 'edit:copy',
                label: 'Copy',
                actionId: 'editor.action.clipboardCopyAction'
            }),
            new EditorCommand(this.editorService, this.selectionService, {
                id: 'edit:paste',
                label: 'Paste',
                actionId: 'editor.action.clipboardPasteAction'
            }),
            new EditorCommand(this.editorService, this.selectionService, {
                id: 'edit:undo',
                label: 'Undo',
                actionId: 'undo'
            }),
            new EditorCommand(this.editorService, this.selectionService, {
                id: 'edit:redo',
                label: 'Redo',
                actionId: 'redo'
            })
        ]
    }
}

export const editorModule = new ContainerModule(bind => {
    bind(EditorRegistry).toSelf().inSingletonScope();
    bind(EditorService).toSelf().inSingletonScope();
    bind(TextModelResolverService).toSelf().inSingletonScope();
    bind(IEditorManager).to(EditorManager).inSingletonScope();
    bind(TheiaPlugin).toDynamicValue(context => context.container.get(IEditorManager));
    bind(IOpenerService).toDynamicValue(context => context.container.get(IEditorManager));
    bind<CommandContribution>(CommandContribution).to(EditorCommands);
    bind<MenuContribution>(MenuContribution).toConstantValue({
        contribute(registry) {
            // Explicitly register the Edit Submenu
            registry.registerSubmenu([MAIN_MENU_BAR], "Edit", "Edit", "2_edit");
            registry.registerMenuAction([MAIN_MENU_BAR, "Edit", "1_undo/redo"], {
                commandId: 'edit:undo'
            });
            registry.registerMenuAction([MAIN_MENU_BAR, "Edit", "1_undo/redo"], {
                commandId: 'edit:redo'
            });
            registry.registerMenuAction([MAIN_MENU_BAR, "Edit", "2_copy"], {
                commandId: 'edit:cut'
            });
            registry.registerMenuAction([MAIN_MENU_BAR, "Edit", "2_copy"], {
                commandId: 'edit:copy'
            });
            registry.registerMenuAction([MAIN_MENU_BAR, "Edit", "2_copy"], {
                commandId: 'edit:paste'
            });
        }
    });
});
