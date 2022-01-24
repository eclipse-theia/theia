/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

/* eslint-disable @typescript-eslint/no-explicit-any,no-unused-expressions */

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { ApplicationProps } from '@theia/application-package/lib/application-props';
FrontendApplicationConfigProvider.set({
    ...ApplicationProps.DEFAULT.frontend.config
});

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { AbstractResourcePreferenceProvider } from './abstract-resource-preference-provider';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { bindPreferenceService } from '@theia/core/lib/browser/frontend-application-bindings';
import { bindMockPreferenceProviders } from '@theia/core/lib/browser/preferences/test';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { Disposable, MessageService } from '@theia/core/lib/common';
import { MonacoWorkspace } from '@theia/monaco/lib/browser/monaco-workspace';
import { PreferenceSchemaProvider } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser';
import { PreferenceTransactionFactory } from './preference-transaction-manager';

disableJSDOM();

class MockFileService {
    releaseContent = new Deferred();
    async read(): Promise<{ value: string }> {
        await this.releaseContent.promise;
        return { value: JSON.stringify({ 'editor.fontSize': 20 }) };
    }
    watch = RETURN_DISPOSABLE;
    onDidFilesChange = RETURN_DISPOSABLE;
}

const RETURN_DISPOSABLE = () => Disposable.NULL;

const mockSchemaProvider = { getCombinedSchema: () => ({ properties: {} }) };

class LessAbstractPreferenceProvider extends AbstractResourcePreferenceProvider {
    getUri(): any { }
    getScope(): any { }
}

describe('AbstractResourcePreferenceProvider', () => {
    let provider: AbstractResourcePreferenceProvider;
    let fileService: MockFileService;

    beforeEach(() => {
        fileService = new MockFileService();
        const testContainer = new Container();
        bindPreferenceService(testContainer.bind.bind(testContainer));
        bindMockPreferenceProviders(testContainer.bind.bind(testContainer), testContainer.unbind.bind(testContainer));
        testContainer.rebind(<any>PreferenceSchemaProvider).toConstantValue(mockSchemaProvider);
        testContainer.bind(<any>FileService).toConstantValue(fileService);
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
        fileService.releaseContent.resolve(); // Allow the initialization to run

        // This promise would reject if the provider had declared itself ready before we resolve `resolveWhenFinished`
        await Promise.race([resolveWhenFinished.promise, errorIfReadyFirst]);
    });

    it('should report values in file when `ready` resolves.', async () => {
        fileService.releaseContent.resolve();
        await provider.ready;
        expect(provider.get('editor.fontSize')).to.equal(20); // The value provided by the mock FileService implementation.
    });
});
