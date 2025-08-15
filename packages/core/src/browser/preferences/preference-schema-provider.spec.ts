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

import { enableJSDOM } from '../test/jsdom';

let disableJSDOM = enableJSDOM();

import * as assert from 'assert';
import { Container } from 'inversify';
import { bindPreferenceService } from '../frontend-application-bindings';
import { FrontendApplicationConfigProvider } from '../frontend-application-config-provider';
import { IndexedAccess, PreferenceDataProperty, PreferenceSchemaService } from '../../common/preferences/preference-schema';
import { PreferenceProvider, PreferenceProviderProvider, PreferenceScope } from '../../common/preferences';

disableJSDOM();

process.on('unhandledRejection', (reason, promise) => {
    console.error(reason);
    throw reason;
});

// const { expect } = require('chai');
let testContainer: Container;

function createTestContainer(): Container {
    const result = new Container();
    bindPreferenceService(result.bind.bind(result));
    return result;
}

const EDITOR_FONT_SIZE_PROPERTIES: IndexedAccess<PreferenceDataProperty> = {
    'editor.fontSize': {
        type: 'number',
        default: 14,
        overridable: true
    },
};
const EDITOR_INSERT_SPACES_PROPERTIES: IndexedAccess<PreferenceDataProperty> = {
    'editor.insertSpaces': {
        type: 'boolean',
        default: true,
        overridable: true
    },
};

describe('Preference Schema Provider', () => {
    let prefSchema: PreferenceSchemaService;
    let prefDefaults: PreferenceProvider;

    before(() => {
        disableJSDOM = enableJSDOM();
        FrontendApplicationConfigProvider.set({
            preferences: {
                'editor.fontSize': 20,
                '[typescript]': { 'editor.fontSize': 24 }
            }
        });
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(async () => {
        testContainer = createTestContainer();
        prefSchema = testContainer.get(PreferenceSchemaService);
        await prefSchema.ready;
        prefSchema.registerOverrideIdentifier('typescript');
        const providerProvider: PreferenceProviderProvider = testContainer.get(PreferenceProviderProvider);
        prefDefaults = providerProvider(PreferenceScope.Default)!;
        await prefDefaults.ready;
    });

    it('Should load all preferences specified in the frontend config.', () => {
        assert.strictEqual(prefDefaults.get('editor.fontSize'), 20);
        assert.strictEqual(prefDefaults.get('[typescript].editor.fontSize'), 24);
    });

    it('Should favor the default specified in the package.json over a default registered by a schema', () => {
        prefSchema.addSchema({
            scope: PreferenceScope.User,
            properties: {
                ...EDITOR_FONT_SIZE_PROPERTIES
            }
        });

        assert.strictEqual(prefDefaults.get('editor.fontSize'), 20);
    });

    it('Should merge language-specific overrides from schemas and the package.json', () => {
        prefSchema.addSchema({
            properties: {
                ...EDITOR_FONT_SIZE_PROPERTIES,
                ...EDITOR_INSERT_SPACES_PROPERTIES,
            },
            scope: PreferenceScope.Default
        });

        prefSchema.registerOverride('editor.insertSpaces', 'typescript', false);

        assert.strictEqual(prefDefaults.get('editor.insertSpaces'), true);
        assert.strictEqual(prefDefaults.get('[typescript].editor.insertSpaces'), false);
        assert.strictEqual(prefDefaults.get('[typescript].editor.fontSize'), 24);
    });
});
