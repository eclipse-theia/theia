// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
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

import { injectable } from 'inversify';
import { PreferenceContribution, PreferenceSchema, PreferenceSchemaService } from '../../common/preferences/preference-schema';
import { FrontendApplicationConfigProvider } from '../frontend-application-config-provider';
import { FrontendApplicationPreferenceConfig } from './preference-contribution';
import { PreferenceLanguageOverrideService } from '../../common/preferences/preference-language-override-service';
import { PreferenceScope } from '../../common/preferences';
import { DefaultTheme } from '@theia/application-package/lib/application-props';

@injectable()
export class FrontendConfigPreferenceContribution implements PreferenceContribution {
    schema: PreferenceSchema = { scope: PreferenceScope.Folder, properties: {} };
    async initSchema(service: PreferenceSchemaService): Promise<void> {
        const config = FrontendApplicationConfigProvider.get();
        if (FrontendApplicationPreferenceConfig.is(config)) {
            service.registerOverride('workbench.colorTheme', undefined, DefaultTheme.defaultForOSTheme(config.defaultTheme));
            if (config.defaultIconTheme) {
                service.registerOverride('workbench.iconTheme', undefined, config.defaultIconTheme);
            }
            try {
                for (const [key, defaultValue] of Object.entries(config.preferences)) {
                    if (PreferenceLanguageOverrideService.testOverrideValue(key, defaultValue)) {
                        for (const [propertyName, value] of Object.entries(defaultValue)) {
                            service.registerOverride(propertyName, key.substring(1, key.length - 1), value);
                        }
                    } else {
                        // regular configuration override
                        service.registerOverride(key, undefined, defaultValue);
                    }
                }
            } catch (e) {
                console.error('Failed to load preferences from frontend configuration.', e);
            }
        }
    }

}
