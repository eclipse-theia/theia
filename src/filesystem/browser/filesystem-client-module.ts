import {ContainerModule} from "inversify";
import {FileSystem} from "../common";
import {FileSystemClient} from "../common/messaging/filesystem-client";
import { createClientWebSocketConnection } from "../../messaging/browser/connection";
import { CommandContribution, SimpleCommand } from "../../application/common/command";
import { MenuBarContribution } from "../../application/common/menu";

export const fileSystemClientModule = (url: string) => new ContainerModule(bind => {
    const fileSystemClient = new FileSystemClient();
    createClientWebSocketConnection(url, connection => fileSystemClient.connection = connection);
    bind<FileSystem>(FileSystem).toConstantValue(fileSystemClient);

    bind<CommandContribution>(CommandContribution).toConstantValue( {
        getCommands() {
            return [
                new SimpleCommand ({  
                    id : 'file:newFile',
                    label : 'New File'
                }),
                new SimpleCommand ({  
                    id : 'file:newFolder',
                    label : 'New Folder'
                }),
                new SimpleCommand ({  
                    id : 'file:open',
                    label : 'Open ...'
                })
            ]
        }
    });
    bind<MenuBarContribution>(MenuBarContribution).toConstantValue({
        contribute(menuBar) {
            return {
                menus : [
                    {
                        label : 'File',
                        items : [
                            {
                                command : 'file:newFile'
                            },
                            {
                                command : 'file:newFolder'
                            },
                            {
                                separator: true
                            },
                            {
                                command : 'file:open'
                            }
                        ]
                    },
                    ... menuBar.menus
                ]
            };
        }
    });
});
