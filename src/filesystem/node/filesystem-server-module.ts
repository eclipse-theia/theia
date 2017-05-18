
/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from "inversify";
import { ConnectionHandler } from "../../messaging/common";
import { FileSystemNode } from "./node-filesystem";
import { FileSystemWatcher } from '../common/filesystem-watcher';
import { FileSystemClient, FileSystem } from "../common/filesystem";
import { JsonRpcProxyFactory } from "../../messaging/common/proxy-factory";
import URI from "../../application/common/uri";

export const ROOT_DIR_OPTION = '--root-dir=';

export const fileSystemServerModule = new ContainerModule(bind => {
    const rootDir = getRootDir();
    if (rootDir) {
        const fileSystem = new FileSystemNode(URI.createFileUriFromFsPath(rootDir))
        const fileSystemWatcher = new FileSystemWatcher()
        bind<ConnectionHandler>(ConnectionHandler).toDynamicValue(ctx => {
            let clients: FileSystemClient[] = [
                fileSystemWatcher.getFileSystemClient()
            ]
            fileSystem.setClient({
                onFileChanges(msg) {
                    for (let client of clients) {
                        client.onFileChanges(msg)
                    }
                }
            })
            return {
                path: "/filesystem",
                onConnection(connection) {
                    const proxyFactory = new JsonRpcProxyFactory<FileSystemClient>("/filesystem", fileSystem)
                    proxyFactory.onConnection(connection)
                    const client = proxyFactory.createProxy()
                    clients.push(client)
                    connection.onDispose(() => {
                        clients = clients.filter(e => e !== client)
                    })
                }
            }
        })
        bind<FileSystem>(FileSystem).toConstantValue(fileSystem)
        bind<FileSystemWatcher>(FileSystemWatcher).toConstantValue(fileSystemWatcher)
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
