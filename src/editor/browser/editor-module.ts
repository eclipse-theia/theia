import {IOpenerService, TheiaPlugin} from "../../application/browser";
import {CommandContribution} from "../../application/common/command";
import {MenuBarContribution} from "../../application/common/menu";
import {EditorManager, IEditorManager} from "./editor-manager";
import {EditorCommand} from "./editor-command";
import {ContainerModule} from "inversify";
import {EditorRegistry} from "./editor-registry";
import {EditorService} from "./editor-service";
import {TextModelResolverService} from "./model-resolver-service";

export const editorModule = new ContainerModule(bind => {
    bind(EditorRegistry).toSelf().inSingletonScope();
    bind(EditorService).toSelf().inSingletonScope();
    bind(TextModelResolverService).toSelf().inSingletonScope();
    bind(IEditorManager).to(EditorManager).inSingletonScope();
    bind(TheiaPlugin).toDynamicValue(context => context.container.get(IEditorManager));
    bind(IOpenerService).toDynamicValue(context => context.container.get(IEditorManager));

    bind<CommandContribution>(CommandContribution).toDynamicValue(context => {
        const editorService = context.container.get<IEditorManager>(IEditorManager);
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
