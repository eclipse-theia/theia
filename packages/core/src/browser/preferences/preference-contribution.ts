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

import { interfaces } from 'inversify';
import { bindContributionProvider, PreferenceProvider } from '../../common';
import { PreferenceScope, ValidPreferenceScopes } from '../../common/preferences/preference-scope';
import { FrontendApplicationConfig } from '@theia/application-package/lib/application-props';
import { isObject } from '../../common/types';
import { PreferenceSchemaServiceImpl } from '../../common/preferences/preference-schema-service';
import { PreferenceContribution, PreferenceSchemaService } from '../../common/preferences/preference-schema';
import { DefaultsPreferenceProvider } from '../../common/preferences/defaults-preference-provider';
import { PreferenceLanguageOverrideService } from '../../common/preferences/preference-language-override-service';
import { FrontendConfigPreferenceContribution } from './frontend-config-preference-contributions';
import { bindPreferenceConfigurations } from '../../common/preferences/preference-configurations';

export function bindPreferenceSchemaProvider(bind: interfaces.Bind): void {
    bindPreferenceConfigurations(bind);
    bind(ValidPreferenceScopes).toConstantValue([PreferenceScope.Default, PreferenceScope.User, PreferenceScope.Workspace, PreferenceScope.Folder]);
    bind(PreferenceSchemaServiceImpl).toSelf().inSingletonScope();
    bind(PreferenceSchemaService).toService(PreferenceSchemaServiceImpl);
    bind(PreferenceProvider).to(DefaultsPreferenceProvider).inSingletonScope().whenTargetNamed(PreferenceScope.Default);
    bind(PreferenceLanguageOverrideService).toSelf().inSingletonScope();
    bindContributionProvider(bind, PreferenceContribution);
    bind(PreferenceContribution).to(FrontendConfigPreferenceContribution).inSingletonScope();
}

/**
 * Specialized {@link FrontendApplicationConfig} to configure default
 * preference values for the {@link PreferenceSchemaProvider}.
 */
export interface FrontendApplicationPreferenceConfig extends FrontendApplicationConfig {
    preferences: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [preferenceName: string]: any
    }
}
export namespace FrontendApplicationPreferenceConfig {
    export function is(config: FrontendApplicationConfig): config is FrontendApplicationPreferenceConfig {
        return isObject(config.preferences);
    }
}
