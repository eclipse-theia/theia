// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import '../../src/browser/style/index.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { bindRootContributionProvider, PreferenceContribution } from '@theia/core';
import { AgentSettingsPreferenceSchema } from '@theia/ai-core/lib/common/agent-preferences';
import { aiCorePreferenceSchema } from '@theia/ai-core/lib/common/ai-core-preferences';
import { AiConfigurationCategory } from './ai-configuration/ai-configuration-category';
import { AiConfigurationCategoryRegistry } from './ai-configuration/ai-configuration-category-registry';
import { AiConfigurationSelectionModel } from './ai-configuration/ai-configuration-selection-model';
import { AiSettingsRowService } from './ai-configuration/components/ai-settings-row-service';
import { bindAiConfigurationSettingCommands } from './ai-configuration/ai-configuration-setting-commands';

export default new ContainerModule(bind => {
    bind(PreferenceContribution).toConstantValue({ schema: AgentSettingsPreferenceSchema });
    bind(PreferenceContribution).toConstantValue({ schema: aiCorePreferenceSchema });

    bindRootContributionProvider(bind, AiConfigurationCategory);
    bind(AiConfigurationCategoryRegistry).toSelf().inSingletonScope();
    bind(AiConfigurationSelectionModel).toSelf().inSingletonScope();
    bind(AiSettingsRowService).toSelf().inSingletonScope();
    bindAiConfigurationSettingCommands(bind);
});
