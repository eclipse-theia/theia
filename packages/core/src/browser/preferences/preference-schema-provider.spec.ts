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

import { enableJSDOM } from '../test/jsdom';

let disableJSDOM = enableJSDOM();

import * as assert from 'assert';
import { Container } from 'inversify';
import { bindPreferenceService } from '../frontend-application-bindings';
import { PreferenceSchemaProperties, PreferenceSchemaProvider } from './preference-contribution';
import { FrontendApplicationConfigProvider } from '../frontend-application-config-provider';
import { ApplicationProps } from '@theia/application-package/lib/application-props';

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

const EDITOR_FONT_SIZE_PROPERTIES: PreferenceSchemaProperties = {
    'editor.fontSize': {
        type: 'number',
        default: 14,
        overridable: true
    },
};
const EDITOR_INSERT_SPACES_PROPERTIES: PreferenceSchemaProperties = {
    'editor.insertSpaces': {
        type: 'boolean',
        default: true,
        overridable: true
    },
};

describe('Preference Schema Provider', () => {
    let prefSchema: PreferenceSchemaProvider;

    before(() => {
        disableJSDOM = enableJSDOM();
        FrontendApplicationConfigProvider.set({
            ...ApplicationProps.DEFAULT.frontend.config,
            'applicationName': 'test',
            'preferences': {
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
        prefSchema = testContainer.get(PreferenceSchemaProvider);
    });

    it('Should load all preferences specified in the frontend config.', () => {
        assert.strictEqual(prefSchema.get('editor.fontSize'), 20);
        assert.strictEqual(prefSchema.get('[typescript].editor.fontSize'), 24);
    });

    it('Should favor the default specified in the package.json over a default registered by a schema', () => {
        prefSchema.setSchema({
            properties: {
                ...EDITOR_FONT_SIZE_PROPERTIES
            }
        });

        assert.strictEqual(prefSchema.get('editor.fontSize'), 20);
    });

    it('Should merge language-specific overrides from schemas and the package.json', () => {
        prefSchema.setSchema({
            properties: {
                ...EDITOR_FONT_SIZE_PROPERTIES,
                ...EDITOR_INSERT_SPACES_PROPERTIES,
                '[typescript]': {
                    type: 'object',
                    default: {
                        'editor.insertSpaces': false
                    }
                }
            }
        });
        assert.strictEqual(prefSchema.get('editor.insertSpaces'), true);
        assert.strictEqual(prefSchema.get('[typescript].editor.insertSpaces'), false);
        assert.strictEqual(prefSchema.get('[typescript].editor.fontSize'), 24);
    });

    it('Should favor package.json specifications in the merge process', () => {
        prefSchema.setSchema({
            properties: {
                ...EDITOR_FONT_SIZE_PROPERTIES,
                ...EDITOR_INSERT_SPACES_PROPERTIES,
                '[typescript]': {
                    type: 'object',
                    default: {
                        'editor.insertSpaces': false,
                        'editor.fontSize': 36,
                    }
                }
            }
        });
        assert.strictEqual(prefSchema.get('[typescript].editor.insertSpaces'), false);
        assert.strictEqual(prefSchema.get('[typescript].editor.fontSize'), 24);
    });
});
