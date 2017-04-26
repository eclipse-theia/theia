import { ContainerModule } from "inversify";
import { ConnectionHandler } from "../../messaging/common";
import { FileSystemNode } from "./node-filesystem2";
import { FileSystem2, FileSystemClient } from "../common/filesystem2";
import { JsonRpcProxyFactory } from "../../messaging/common/proxy-factory";

export const ROOT_DIR_OPTION = '--root-dir=';

export const fileSystemServerModule = new ContainerModule(bind => {
    const rootDir = getRootDir();
    if (rootDir) {
        const fileSystem2 = new FileSystemNode(`file://${rootDir}`)
        const proxyFactory = new JsonRpcProxyFactory<FileSystemClient>(fileSystem2, "/filesystem2")
        bind<ConnectionHandler>(ConnectionHandler).toConstantValue(proxyFactory)
        bind<FileSystem2>(FileSystem2).toDynamicValue(ctx => {
            fileSystem2.setClient(proxyFactory.createProxy())
            return fileSystem2
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
