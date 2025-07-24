// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { AbstractResourcePreferenceProvider, FileContentStatus, PreferenceStorage, PreferenceStorageFactory } from './abstract-resource-preference-provider';
import { bindPreferenceService } from '@theia/core/lib/browser/frontend-application-bindings';
import { bindMockPreferenceProviders } from '@theia/core/lib/browser/preferences/test';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { Listener, MessageService, PreferenceSchemaService } from '@theia/core/lib/common';
import { MonacoWorkspace } from '@theia/monaco/lib/browser/monaco-workspace';
import { EditorManager } from '@theia/editor/lib/browser';
import { PreferenceTransactionFactory } from '../browser/preference-transaction-manager';
import { JSONValue } from '@theia/core/shared/@lumino/coreutils';

disableJSDOM();

class MockPreferenceStorage implements PreferenceStorage {
    onDidChangeFileContent: Listener.Registration<FileContentStatus, Promise<boolean>> = Listener.None as unknown as Listener.Registration<FileContentStatus, Promise<boolean>>;
    writeValue(key: string, path: string[], value: JSONValue): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
    dispose(): void { }
    releaseContent = new Deferred();
    async read(): Promise<string> {
        await this.releaseContent.promise;
        return JSON.stringify({ 'editor.fontSize': 20 });
    }
}
const mockSchemaProvider = { getSchemaProperty: () => undefined };

class LessAbstractPreferenceProvider extends AbstractResourcePreferenceProvider {
    getUri(): any { }
    getScope(): any { }
}

describe('AbstractResourcePreferenceProvider', () => {
    let provider: AbstractResourcePreferenceProvider;
    let preferenceStorage: MockPreferenceStorage;

    beforeEach(() => {
        preferenceStorage = new MockPreferenceStorage();
        const testContainer = new Container();
        bindPreferenceService(testContainer.bind.bind(testContainer));
        bindMockPreferenceProviders(testContainer.bind.bind(testContainer), testContainer.unbind.bind(testContainer));
        testContainer.rebind(<any>PreferenceSchemaService).toConstantValue(mockSchemaProvider);
        testContainer.bind(<any>PreferenceStorageFactory).toFactory(() => () => preferenceStorage);
        testContainer.bind(<any>MessageService).toConstantValue(undefined);
        testContainer.bind(<any>MonacoWorkspace).toConstantValue(undefined);
        testContainer.bind(<any>EditorManager).toConstantValue(undefined);
        testContainer.bind(<any>PreferenceTransactionFactory).toConstantValue(undefined);
        provider = testContainer.resolve(<any>LessAbstractPreferenceProvider);
    });

    it('should not store any preferences before it is ready.', async () => {
        const resolveWhenFinished = new Deferred();
        const errorIfReadyFirst = provider.ready.then(() => Promise.reject());

        expect(provider.get('editor.fontSize')).to.be.undefined;

        resolveWhenFinished.resolve();
        preferenceStorage.releaseContent.resolve(); // Allow the initialization to run

        // This promise would reject if the provider had declared itself ready before we resolve `resolveWhenFinished`
        await Promise.race([resolveWhenFinished.promise, errorIfReadyFirst]);
    });

    it('should report values in file when `ready` resolves.', async () => {
        preferenceStorage.releaseContent.resolve();
        await provider.ready;
        expect(provider.get('editor.fontSize')).to.equal(20); // The value provided by the mock FileService implementation.
    });
});
