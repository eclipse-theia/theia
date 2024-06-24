// *****************************************************************************
// Copyright (C) 2024 STMicroelectronics and others.
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

import { interfaces } from '@theia/core/shared/inversify';
import { createPreferenceProxy, PreferenceProxy, PreferenceService, PreferenceContribution, PreferenceSchema } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';

export const TestConfigSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        'testing.openTesting': {
            type: 'string',
            enum: ['neverOpen', 'openOnTestStart'],
            enumDescriptions: [
                nls.localizeByDefault('Never automatically open the testing views'),
                nls.localizeByDefault('Open the test results view when tests start'),
            ],
            description: nls.localizeByDefault('Controls when the testing view should open.'),
            default: 'neverOpen',
            scope: 'resource',
        }
    }
};

export interface TestConfiguration {
    'testing.openTesting': 'neverOpen' | 'openOnTestStart';
}

export const TestPreferenceContribution = Symbol('TestPreferenceContribution');
export const TestPreferences = Symbol('TestPreferences');
export type TestPreferences = PreferenceProxy<TestConfiguration>;

export function createTestPreferences(preferences: PreferenceService, schema: PreferenceSchema = TestConfigSchema): TestPreferences {
    return createPreferenceProxy(preferences, schema);
}

export const bindTestPreferences = (bind: interfaces.Bind): void => {
    bind(TestPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(TestPreferenceContribution);
        return createTestPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(TestPreferenceContribution).toConstantValue({ schema: TestConfigSchema });
    bind(PreferenceContribution).toService(TestPreferenceContribution);
};
