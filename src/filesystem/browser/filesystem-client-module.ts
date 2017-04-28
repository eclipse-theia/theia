import { FileSystemWatcher } from '../../filesystem/common/filesystem-watcher';
import { CommandContribution } from '../../application/common/command';
import { MenuContribution } from '../../application/common/menu';
import { WebSocketConnection } from '../../messaging/browser/connection';
import { FileCommandContribution, FileMenuContribution } from '../browser/filesystem-commands';
import { FileSystem } from '../common/filesystem';
import { ContainerModule } from 'inversify';

export const fileSystemClientModule = new ContainerModule(bind => {
    bind(FileSystemWatcher).toSelf().inSingletonScope();
    bind(FileSystem).toDynamicValue(ctx => {
        const connnection = ctx.container.get(WebSocketConnection);
        const fileSystemClient = ctx.container.get(FileSystemWatcher).getFileSystemClient();
        return connnection.createProxy<FileSystem>("/filesystem", fileSystemClient);
    })
    bind<CommandContribution>(CommandContribution).to(FileCommandContribution);
    bind<MenuContribution>(MenuContribution).to(FileMenuContribution);
});

