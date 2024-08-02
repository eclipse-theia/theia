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
import { CodeCompletionAgent, CodeCompletionAgentImpl } from '../common/code-completion-agent';
import { AICodeCompletionProvider } from './ai-code-completion-provider';
import { AIFrontendApplicationContribution } from './ai-code-frontend-application-contribution';
import { FrontendApplicationContribution, PreferenceContribution } from '@theia/core/lib/browser';
import { Agent } from '@theia/ai-core';
import { AICodeCompletionPreferencesSchema } from './ai-code-completion-preference';
import { AICodeInlineCompletionsProvider } from './ai-code-inline-completion-provider';

export default new ContainerModule(bind => {
    bind(CodeCompletionAgentImpl).toSelf().inSingletonScope();
    bind(CodeCompletionAgent).toService(CodeCompletionAgentImpl);
    bind(Agent).toService(CodeCompletionAgentImpl);
    bind(AICodeCompletionProvider).toSelf().inSingletonScope();
    bind(AICodeInlineCompletionsProvider).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).to(AIFrontendApplicationContribution).inSingletonScope();
    bind(PreferenceContribution).toConstantValue({ schema: AICodeCompletionPreferencesSchema });
});
