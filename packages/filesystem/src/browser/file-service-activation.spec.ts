// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { Disposable, URI } from '@theia/core';
import { expect } from 'chai';
import { FileSystemProvider, FileSystemProviderCapabilities, WatchOptions } from '../common/files';
import { FileService } from './file-service';

disableJSDOM();

/** A `FileService` with a short, overridable activation timeout so tests need not wait the production duration. */
class TestFileService extends FileService {
    constructor(protected readonly timeout: number) {
        super();
    }
    protected override getActivationTimeout(): number {
        return this.timeout;
    }
}

function createMockProvider(): FileSystemProvider {
    return {
        capabilities: FileSystemProviderCapabilities.PathCaseSensitive,
        onDidChangeCapabilities: () => Disposable.NULL,
        onDidChangeFile: () => Disposable.NULL,
        onFileWatchError: () => Disposable.NULL,
        watch: (_resource: URI, _options: WatchOptions): Disposable => Disposable.NULL,
        stat: () => { throw new Error('not implemented'); },
        readdir: () => { throw new Error('not implemented'); },
        readFile: () => { throw new Error('not implemented'); },
        writeFile: () => { throw new Error('not implemented'); },
        delete: () => { throw new Error('not implemented'); },
        mkdir: () => { throw new Error('not implemented'); },
        rename: () => { throw new Error('not implemented'); },
    } as FileSystemProvider;
}

/** Resolve to the given value, or to `'PENDING'` if `promise` does not settle within `millis`. */
function withinTimeout<T>(promise: Promise<T>, millis = 200): Promise<T | 'PENDING'> {
    return Promise.race([
        promise,
        new Promise<'PENDING'>(resolve => setTimeout(() => resolve('PENDING'), millis))
    ]);
}

describe('FileService activateProvider resilience (#17506)', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    it('resolves a pending activation once a provider is registered, even if an onWillActivate listener never settles', async () => {
        const fileService = new FileService();
        const scheme = 'user-storage';
        const provider = createMockProvider();

        // Reproduce the real-world hang: an `onWillActivateFileSystemProvider` listener whose
        // `waitUntil` promise never settles. In the wild this happens when an awaited dependency
        // inside the listener (e.g. a lost RPC reply, or a detached microtask in `createProvider`)
        // never resolves, leaving `WaitUntilEvent.fire`'s `Promise.all(waitables)` pending forever.
        fileService.onWillActivateFileSystemProvider(event => {
            if (event.scheme === scheme) {
                event.waitUntil(new Promise<void>(() => { /* never settles */ }));
            }
        });

        const activation = fileService.activateProvider(scheme);

        // The provider does become available (as the reporter demonstrated by registering it
        // manually against the live, hung frontend container).
        fileService.registerProvider(scheme, provider);

        // Before the fix: `activateProvider` is coupled to the settlement of every listener's
        // `waitUntil` promise, so the dangling listener wedges the activation permanently and
        // this resolves to 'PENDING'. After the fix: registering the provider resolves the
        // pending activation immediately.
        const resolved = await withinTimeout(activation);
        expect(resolved).to.equal(provider);
    });

    it('rejects an activation that never registers a provider once the timeout elapses, instead of hanging forever', async () => {
        const fileService = new TestFileService(50);
        const scheme = 'user-storage';

        // A listener whose `waitUntil` never settles and which never registers a provider:
        // the worst case where the provider's own (normally fast) backend dependency dangles.
        fileService.onWillActivateFileSystemProvider(event => {
            if (event.scheme === scheme) {
                event.waitUntil(new Promise<void>(() => { /* never settles */ }));
            }
        });

        // Before the fix this never settles (the test would hit 'PENDING'); after the fix the
        // activation rejects once the timeout elapses, so startup can proceed (degraded).
        const outcome = await withinTimeout(
            fileService.activateProvider(scheme).then(() => 'RESOLVED', () => 'REJECTED'),
            300
        );
        expect(outcome).to.equal('REJECTED');
    });

    it('does not poison the scheme after a timed-out activation: a later activation can still succeed', async () => {
        const fileService = new TestFileService(50);
        const scheme = 'user-storage';

        fileService.onWillActivateFileSystemProvider(event => {
            if (event.scheme === scheme) {
                event.waitUntil(new Promise<void>(() => { /* never settles */ }));
            }
        });

        // First attempt times out and rejects.
        await fileService.activateProvider(scheme).then(() => { throw new Error('should have rejected'); }, () => undefined);

        // A fresh attempt must be able to succeed once a provider becomes available.
        const provider = createMockProvider();
        const retry = fileService.activateProvider(scheme);
        fileService.registerProvider(scheme, provider);
        expect(await withinTimeout(retry)).to.equal(provider);
    });
});
