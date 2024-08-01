// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { ContainerModule } from '@theia/core/shared/inversify';
import { CodeFixAgent, CodeFixAgentImpl } from './code-fix-agent';
import { AICodeFixProvider } from './ai-code-fix-provider';
import { AIFrontendApplicationContribution } from './ai-code-fix-frontend-application-contribution';
import { FrontendApplicationContribution, PreferenceContribution } from '@theia/core/lib/browser';
import { Agent } from '@theia/ai-core';
import { AICodeFixPreferencesSchema } from './ai-code-fix-preference';

export default new ContainerModule(bind => {
    bind(CodeFixAgentImpl).toSelf().inSingletonScope();
    bind(CodeFixAgent).toService(CodeFixAgentImpl);
    bind(Agent).toService(CodeFixAgentImpl);
    bind(AICodeFixProvider).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).to(AIFrontendApplicationContribution).inSingletonScope();
    bind(PreferenceContribution).toConstantValue({ schema: AICodeFixPreferencesSchema });
});
