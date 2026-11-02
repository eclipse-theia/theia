/*
 * Copyright (C) 2026 The Eclipse Foundation.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License, v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0, or the GNU General Public License,
 * version 2 with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 */

import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import * as cp from 'child_process';
import { expect } from 'chai';
import { ConnectionErrorHandler, ILogger } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { IPCConnectionProvider } from '@theia/core/lib/node';
import { FileSystemWatcherProcessLifecycle } from './filesystem-backend-module';

class MockChildProcess extends EventEmitter {
    readonly stdout = new PassThrough();
    readonly stderr = new PassThrough();
    readonly stdio = [undefined, undefined, undefined, undefined, new PassThrough()];
    killed = 0;

    kill(): boolean {
        this.killed++;
        this.emit('exit', undefined);
        return true;
    }

    exit(): void {
        this.emit('exit', 1);
    }
}

class TestIPCConnectionProvider extends IPCConnectionProvider {
    protected override readonly logger: ILogger = new MockLogger();
    readonly children: MockChildProcess[] = [];

    protected override fork(): cp.ChildProcess {
        const child = new MockChildProcess();
        this.children.push(child);
        return child as unknown as cp.ChildProcess;
    }
}

describe('FileSystemWatcherProcessLifecycle', () => {

    it('disposes a restarted listener and prevents another restart', () => {
        const provider = new TestIPCConnectionProvider();
        const lifecycle = new FileSystemWatcherProcessLifecycle();
        const logger = new MockLogger();
        lifecycle.register(provider.listen({
            serverName: 'watcher-test',
            entryPoint: 'unused',
            errorHandler: new ConnectionErrorHandler({ serverName: 'watcher-test', logger })
        }, () => { }));

        provider.children[0].exit();
        expect(provider.children).to.have.lengthOf(2);

        lifecycle.onStop();

        expect(provider.children[1].killed).to.equal(1);
        provider.children[1].exit();
        expect(provider.children).to.have.lengthOf(2);
    });

    it('disposes listeners registered after shutdown begins', () => {
        const lifecycle = new FileSystemWatcherProcessLifecycle();
        let disposed = false;
        lifecycle.onStop();
        lifecycle.register({ dispose: () => { disposed = true; } });
        expect(disposed).to.be.true;
    });
});
