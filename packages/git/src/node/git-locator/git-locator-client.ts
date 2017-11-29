/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as paths from 'path';
import { inject, injectable } from "inversify";
import { JsonRpcProxyFactory, DisposableCollection } from "@theia/core";
import { IPCConnectionProvider } from "@theia/core/lib/node";
import { GitLocator, GitLocateOptions } from "./git-locator-protocol";

@injectable()
export class GitLocatorClient implements GitLocator {

    protected readonly toDispose = new DisposableCollection();

    @inject(IPCConnectionProvider)
    protected readonly ipcConnectionProvider: IPCConnectionProvider;

    dispose(): void {
        this.toDispose.dispose();
    }

    locate(path: string, options: GitLocateOptions): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const toStop = this.ipcConnectionProvider.listen({
                serverName: 'git-locator',
                entryPoint: paths.resolve(__dirname, 'git-locator-host')
            }, async connection => {
                const proxyFactory = new JsonRpcProxyFactory<GitLocator>();
                const remote = proxyFactory.createProxy();
                proxyFactory.listen(connection);
                try {
                    resolve(await remote.locate(path, options));
                } catch (e) {
                    reject(e);
                } finally {
                    toStop.dispose();
                }
            });
            this.toDispose.push(toStop);
        });
    }

}
