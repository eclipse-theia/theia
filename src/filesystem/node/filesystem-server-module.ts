import { ContainerModule } from "inversify";
import { ConnectionHandler } from "../../messaging/common";
import { FileSystemNode } from "./node-filesystem";
import { FileSystem, FileSystemClient } from "../common/filesystem";
import { JsonRpcProxyFactory } from "../../messaging/common/proxy-factory";

export const ROOT_DIR_OPTION = '--root-dir=';

export const fileSystemServerModule = new ContainerModule(bind => {
    const rootDir = getRootDir();
    if (rootDir) {
        const fileSystem = new FileSystemNode(`file://${rootDir}`)
        const proxyFactory = new JsonRpcProxyFactory<FileSystemClient>(fileSystem, "/filesystem")
        bind<ConnectionHandler>(ConnectionHandler).toConstantValue(proxyFactory)
        bind<FileSystem>(FileSystem).toDynamicValue(ctx => {
            fileSystem.setClient(proxyFactory.createProxy())
            return fileSystem
        })
    } else {
        throw new Error(`The directory is unknown, please use '${ROOT_DIR_OPTION}' option`);
    }
});

export function getRootDir(): string | undefined {
    const arg = process.argv.filter(arg => arg.startsWith(ROOT_DIR_OPTION))[0];
    if (arg) {
        return arg.substring(ROOT_DIR_OPTION.length);
    } else {
        const cwd = process.cwd();
        console.info(`--root-dir= was not present. Falling back to current working directory: '${cwd}.'`)
        return cwd;
    }
}
