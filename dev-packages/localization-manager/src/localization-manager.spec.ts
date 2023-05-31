// *****************************************************************************
// Copyright (C) 2021 TypeFox and others.
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

import * as assert from 'assert';
import { DeeplParameters, DeeplResponse } from './deepl-api';
import { LocalizationManager, LocalizationOptions } from './localization-manager';

describe('localization-manager#translateLanguage', () => {

    async function mockLocalization(parameters: DeeplParameters): Promise<DeeplResponse> {
        return {
            translations: parameters.text.map(value => ({
                detected_source_language: '',
                text: `[${value}]`
            }))
        };
    }

    const manager = new LocalizationManager(mockLocalization);
    const defaultOptions: LocalizationOptions = {
        authKey: '',
        freeApi: false,
        sourceFile: '',
        targetLanguages: ['EN']
    };

    it('should translate a single value', async () => {
        const input = {
            key: 'value'
        };
        const target = {};
        await manager.translateLanguage(input, target, 'EN', defaultOptions);
        assert.deepStrictEqual(target, {
            key: '[value]'
        });
    });

    it('should translate nested values', async () => {
        const input = {
            a: {
                b: 'b'
            },
            c: 'c'
        };
        const target = {};
        await manager.translateLanguage(input, target, 'EN', defaultOptions);
        assert.deepStrictEqual(target, {
            a: {
                b: '[b]'
            },
            c: '[c]'
        });
    });

    it('should not override existing targets', async () => {
        const input = {
            a: 'a'
        };
        const target = {
            a: 'b'
        };
        await manager.translateLanguage(input, target, 'EN', defaultOptions);
        assert.deepStrictEqual(target, {
            a: 'b'
        });
    });

    it('should keep placeholders intact', async () => {
        const input = {
            key: '{1} {0}'
        };
        const target = {};
        await manager.translateLanguage(input, target, 'EN', defaultOptions);
        assert.deepStrictEqual(target, {
            key: '[{1} {0}]'
        });
    });
});
