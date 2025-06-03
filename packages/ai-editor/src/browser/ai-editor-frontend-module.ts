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

import { AIVariableContribution } from '@theia/ai-core';
import { FrontendApplicationContribution, KeybindingContribution } from '@theia/core/lib/browser';
import { CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { bindContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { ContainerModule } from '@theia/core/shared/inversify';
import '../../style/ask-ai-input.css';
import { AICodeActionProvider } from './ai-code-action-provider';
import { AiEditorCommandContribution } from './ai-editor-command-contribution';
import { EditorContextVariableContribution } from './ai-editor-context-variable';
import { DiagnosticContextCollector } from './diagnostic-context-collector';
import { EditorContextCollectorContribution } from './editor-context-collector';
import { EditorContextCollectorService } from './editor-context-collector-service';

export default new ContainerModule(bind => {
    bind(AiEditorCommandContribution).toSelf().inSingletonScope();

    bind(CommandContribution).toService(AiEditorCommandContribution);
    bind(MenuContribution).toService(AiEditorCommandContribution);
    bind(KeybindingContribution).toService(AiEditorCommandContribution);

    bind(AIVariableContribution).to(EditorContextVariableContribution).inSingletonScope();

    bind(EditorContextCollectorService).toSelf().inSingletonScope();

    bindContributionProvider(bind, EditorContextCollectorContribution);
    bind(EditorContextCollectorContribution).to(DiagnosticContextCollector);

    bind(AICodeActionProvider).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(AICodeActionProvider);
});
