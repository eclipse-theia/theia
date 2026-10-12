// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
const disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { PreferenceService } from '@theia/core';
import { AICorePreferences } from '@theia/ai-core/lib/common/ai-core-preferences';
import { DiscoveredModel } from '@theia/ai-core/lib/common';
import { OpenAiModelDescription } from '../common';
import { OpenAiPreferencesSchema, USE_RESPONSE_API_PREF } from '../common/openai-preferences';
import { OpenAiFrontendApplicationContribution } from './openai-frontend-application-contribution';

disableJSDOM();

class TestOpenAiFrontendApplicationContribution extends OpenAiFrontendApplicationContribution {
    protected override readonly preferenceService = {
        get: <T>(name: string, defaultValue: T): T =>
            name === USE_RESPONSE_API_PREF && this.officialUseResponseApi !== undefined ? this.officialUseResponseApi as T : defaultValue
    } as PreferenceService;

    protected override aiCorePreferences = { get: () => undefined } as unknown as AICorePreferences;

    constructor(protected readonly officialUseResponseApi: boolean | undefined) {
        super();
    }

    override createModelDescription(model: DiscoveredModel): OpenAiModelDescription {
        return super.createModelDescription(model);
    }

    override createCustomModelDescriptionsFromPreferences(preferences: Partial<OpenAiModelDescription>[]): OpenAiModelDescription[] {
        return super.createCustomModelDescriptionsFromPreferences(preferences);
    }
}

describe('OpenAiFrontendApplicationContribution Responses API defaults', () => {
    it('defaults the official preference schema to true', () => {
        expect(OpenAiPreferencesSchema.properties[USE_RESPONSE_API_PREF].default).to.equal(true);
    });

    for (const officialSetting of [undefined, true, false]) {
        it(`uses ${officialSetting ?? true} for official models when the preference is ${officialSetting}`, () => {
            const contribution = new TestOpenAiFrontendApplicationContribution(officialSetting);
            const description = contribution.createModelDescription({ id: 'gpt-4o' });
            expect(description.useResponseApi).to.equal(officialSetting ?? true);
        });

        for (const customSetting of [undefined, false, true]) {
            it(`uses ${customSetting ?? false} for custom setting ${customSetting} independently of official setting ${officialSetting}`, () => {
                const contribution = new TestOpenAiFrontendApplicationContribution(officialSetting);
                const preference: Partial<OpenAiModelDescription> = { model: 'custom-model', url: 'https://example.com/v1' };
                if (customSetting !== undefined) {
                    preference.useResponseApi = customSetting;
                }
                const descriptions = contribution.createCustomModelDescriptionsFromPreferences([preference]);
                expect(descriptions).to.have.lengthOf(1);
                expect(descriptions[0].useResponseApi).to.equal(customSetting ?? false);
            });
        }
    }
});
