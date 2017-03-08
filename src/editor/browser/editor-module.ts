import { IOpenerService, TheiaPlugin } from '../../application/browser';
import { CommandContribution, SimpleCommand } from '../../application/common/command';
import { MenuBarContribution } from '../../application/common/menu';
import { EditorOpenerService } from './editor-opener';
import { ContainerModule } from 'inversify';

export const editorModule = new ContainerModule(bind => {
    bind(EditorOpenerService).toSelf().inSingletonScope();
    bind(TheiaPlugin).toDynamicValue(context => context.container.get(EditorOpenerService));
    bind(IOpenerService).toDynamicValue(context => context.container.get(EditorOpenerService));

    bind<CommandContribution>(CommandContribution).toConstantValue( {
        getCommands() {
            return [
                new SimpleCommand ({  
                    id : 'edit:cut',
                    label : 'Cut'
                }),
                new SimpleCommand ({  
                    id : 'edit:copy',
                    label : 'Copy'
                }),
                new SimpleCommand ({  
                    id : 'edit:paste',
                    label : 'Paste'
                }),
                new SimpleCommand ({  
                    id : 'edit:undo',
                    label : 'Undo'
                }),
                new SimpleCommand ({  
                    id : 'edit:redo',
                    label : 'Redo'
                })
            ]
        }
    });
    bind<MenuBarContribution>(MenuBarContribution).toConstantValue({
        contribute(menuBar) {
            return {
                menus : [
                    ... menuBar.menus,
                    {
                        label : 'Edit',
                        items : [
                            {
                                command : 'edit:undo'
                            },
                            {
                                command : 'edit:redo'
                            },
                            {
                                separator: true
                            },
                            {
                                command : 'edit:cut'
                            },
                            {
                                command : 'edit:copy'
                            },
                            {
                                command : 'edit:paste'
                            }
                        ]
                    }
                ]
            };
        }
    });
});
