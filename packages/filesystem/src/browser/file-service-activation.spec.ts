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
});
