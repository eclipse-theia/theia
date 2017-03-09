import { IOpenerService, TheiaPlugin } from '../../application/browser';
import { CommandContribution } from '../../application/common/command';
import { MenuBarContribution } from '../../application/common/menu';
import { EditorService, IEditorService } from './editor-service';
import { EditorCommand } from './editor-command';
import { ContainerModule } from 'inversify';

export const editorModule = new ContainerModule(bind => {
    bind(IEditorService).to(EditorService).inSingletonScope();
    bind(TheiaPlugin).toDynamicValue(context => context.container.get(IEditorService));
    bind(IOpenerService).toDynamicValue(context => context.container.get(IEditorService));
 
    bind<CommandContribution>(CommandContribution).toDynamicValue(context => {
        const editorService = context.container.get<IEditorService>(IEditorService);
        return {
            getCommands() {
                return [
                    new EditorCommand(editorService, {
                        id: 'edit:cut',
                        label: 'Cut',
                        actionId: 'editor.action.clipboardCutAction'
                    }),
                    new EditorCommand(editorService, {
                        id: 'edit:copy',
                        label: 'Copy',
                        actionId: 'editor.action.clipboardCopyAction'
                    }),
                    new EditorCommand(editorService, {
                        id: 'edit:paste',
                        label: 'Paste',
                        actionId: 'editor.action.clipboardPasteAction'
                    }),
                    new EditorCommand(editorService, {
                        id: 'edit:undo',
                        label: 'Undo',
                        actionId: 'undo'
                    }),
                    new EditorCommand(editorService, {
                        id: 'edit:redo',
                        label: 'Redo',
                        actionId: 'redo'
                    })
                ]
            }
        }
    });
    bind<MenuBarContribution>(MenuBarContribution).toConstantValue({
        contribute(menuBar) {
            return {
                menus: [
                    ...menuBar.menus,
                    {
                        label: 'Edit',
                        items: [
                            {
                                command: 'edit:undo'
                            },
                            {
                                command: 'edit:redo'
                            },
                            {
                                separator: true
                            },
                            {
                                command: 'edit:cut'
                            },
                            {
                                command: 'edit:copy'
                            },
                            {
                                command: 'edit:paste'
                            }
                        ]
                    }
                ]
            };
        }
    });
});
