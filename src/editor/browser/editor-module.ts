import { IOpenerService, TheiaPlugin } from '../../application/browser';
import { CommandContribution, SimpleCommand } from '../../application/common/command';
import { MenuBarContribution } from '../../application/common/menu';
import { EditorService, IEditorService } from './editor-service';
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
                    new SimpleCommand({
                        id: 'edit:cut',
                        label: 'Cut',
                        isEnabled: () => !!editorService.currentEditor,
                        execute: () => {
                            const currentEditor = editorService.currentEditor;
                            if (currentEditor) {
                                console.log('Execture cut for the editor:' + currentEditor.id);
                            }
                        }
                    }),
                    new SimpleCommand({
                        id: 'edit:copy',
                        label: 'Copy'
                    }),
                    new SimpleCommand({
                        id: 'edit:paste',
                        label: 'Paste'
                    }),
                    new SimpleCommand({
                        id: 'edit:undo',
                        label: 'Undo'
                    }),
                    new SimpleCommand({
                        id: 'edit:redo',
                        label: 'Redo'
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
