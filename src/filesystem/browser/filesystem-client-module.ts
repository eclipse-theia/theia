import { FileSystemWatcher } from '../../filesystem/common/filesystem-watcher';
import { CommandContribution } from '../../application/common/command';
import { MenuContribution } from '../../application/common/menu';
import { listen } from '../../messaging/browser/connection';
import { JsonRpcProxyFactory } from '../../messaging/common/proxy-factory';
import { FileCommandContribution, FileMenuContribution } from '../browser/filesystem-commands';
import { FileSystem2 } from '../common/filesystem2';
import { ContainerModule } from 'inversify';

export const fileSystemClientModule = new ContainerModule(bind => {
    const fileSystemWatcher = new FileSystemWatcher()
    bind(FileSystemWatcher).toConstantValue(fileSystemWatcher)

    const proxyFactory = new JsonRpcProxyFactory<FileSystem2>(fileSystemWatcher.getFileSystemClient(), "/filesystem2");
    listen(proxyFactory)
    bind<FileSystem2>(FileSystem2).toDynamicValue(ctx => {
        let result = proxyFactory.createProxy()
        return result
    })
    bind<CommandContribution>(CommandContribution).to(FileCommandContribution);
    bind<MenuContribution>(MenuContribution).to(FileMenuContribution);
});

