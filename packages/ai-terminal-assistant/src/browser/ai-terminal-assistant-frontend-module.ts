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

import '../../src/browser/style/ai-terminal-assistant.css';
import '../../src/browser/style/monaco-decorations.css';
import { Agent } from '@theia/ai-core/lib/common';
import { bindViewContribution, FrontendApplicationContribution, WidgetFactory } from '@theia/core/lib/browser';
import { ContainerModule } from '@theia/core/shared/inversify';
import { AiTerminalSummaryAgent } from './terminal-output-analysis-agent';
import { AiTerminalAssistantContribution } from './ai-terminal-assistant-contribution';
import { SummaryServiceImpl, SummaryService } from './ai-terminal-assistant-service';
import { AiTerminalAssistantCommandService, AiTerminalAssistantCommandServiceImpl } from './ai-terminal-assistant-command-service';
import { AiTerminalAssistantViewWidget } from './ai-terminal-assistant-view-widget';
import { SummaryViewWidget } from './ai-terminal-assistant-summary-widget';
import { AiTerminalBufferWidget } from './ai-terminal-assistant-buffer-widget';
import {  bindAiTerminalAssistantPreferences } from './ai-terminal-assistant-preferences';

export default new ContainerModule(bind => {
    // Services
    bind(SummaryServiceImpl).toSelf().inSingletonScope();
    bind(SummaryService).toService(SummaryServiceImpl);

    bind(AiTerminalAssistantCommandServiceImpl).toSelf().inSingletonScope();
    bind(AiTerminalAssistantCommandService).toService(AiTerminalAssistantCommandServiceImpl);

    // Agent
    bind(AiTerminalSummaryAgent).toSelf().inSingletonScope();
    bind(Agent).toService(AiTerminalSummaryAgent);

    // Widgets
    bind(AiTerminalBufferWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: AiTerminalBufferWidget.ID,
        createWidget: () => container.get(AiTerminalBufferWidget)
    })).inSingletonScope();

    bind(SummaryViewWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: SummaryViewWidget.ID,
        createWidget: () => container.get(SummaryViewWidget)
    })).inSingletonScope();

    bind(AiTerminalAssistantViewWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: AiTerminalAssistantViewWidget.ID,
        createWidget: () => ctx.container.get<AiTerminalAssistantViewWidget>(AiTerminalAssistantViewWidget)
    })).inSingletonScope();

    // View contribution (provides CommandContribution, MenuContribution, KeybindingContribution)
    bindViewContribution(bind, AiTerminalAssistantContribution);
    bind(FrontendApplicationContribution).toService(AiTerminalAssistantContribution);

    bindAiTerminalAssistantPreferences(bind);
});
