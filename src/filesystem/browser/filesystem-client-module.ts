import { FileSystemWatcher } from '../../filesystem/common/filesystem-watcher';
import { CommandContribution } from '../../application/common/command';
import { MenuContribution } from '../../application/common/menu';
import { listen } from '../../messaging/browser/connection';
import { JsonRpcProxyFactory } from '../../messaging/common/proxy-factory';
import { FileCommandContribution, FileMenuContribution } from '../browser/filesystem-commands';
import { FileSystem } from '../common/filesystem';
import { ContainerModule } from 'inversify';

export const fileSystemClientModule = new ContainerModule(bind => {
    const fileSystemWatcher = new FileSystemWatcher()
    bind(FileSystemWatcher).toConstantValue(fileSystemWatcher)

    const proxyFactory = new JsonRpcProxyFactory<FileSystem>(fileSystemWatcher.getFileSystemClient(), "/filesystem");
    listen(proxyFactory)
    bind<FileSystem>(FileSystem).toDynamicValue(ctx => {
        let result = proxyFactory.createProxy()
        return result
    })
    bind<CommandContribution>(CommandContribution).to(FileCommandContribution);
    bind<MenuContribution>(MenuContribution).to(FileMenuContribution);
});

