/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as cluster from 'cluster';
import { injectable, inject } from "inversify";
import { createRemoteMaster, IMasterProcess, IServerProcess } from './cluster-protocol';

export const RemoteMasterProcessFactory = Symbol('RemoteMasterProcessFactory');
export type RemoteMasterProcessFactory = (serverProcess: IServerProcess) => IMasterProcess;
export const clusterRemoteMasterProcessFactory: RemoteMasterProcessFactory = serverProcess => createRemoteMaster(cluster.worker, serverProcess);
export const stubRemoteMasterProcessFactory: RemoteMasterProcessFactory = serverProcess => {
    let ready = false;
    return {
        onDidInitialize: () => {
            ready = true;
        },
        restart: async () => {
            if (ready) {
                serverProcess.onDidRestart();
            }
        }
    };
};

@injectable()
export class ServerProcess {

    readonly master: IMasterProcess;
    protected resolveRestarted: () => void;
    readonly restarted = new Promise<void>(resolve => this.resolveRestarted = resolve);

    constructor(
        @inject(RemoteMasterProcessFactory) protected readonly masterFactory: RemoteMasterProcessFactory
    ) {
        this.master = this.masterFactory({
            onDidRestart: this.resolveRestarted
        });
        this.master.onDidInitialize();
    }

}
