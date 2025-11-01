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

import '../../src/browser/style/ai-terminal-summary.css';
import { Agent } from '@theia/ai-core/lib/common';
import { CommandContribution, MenuContribution } from '@theia/core';
import { KeybindingContribution, WidgetFactory } from '@theia/core/lib/browser';
import { ContainerModule } from '@theia/core/shared/inversify';
import { AiTerminalSummaryAgent } from './ai-terminal-summary-agent';
import { AiTerminalSummaryContribution } from './ai-terminal-summary-contribution';
import { SummaryViewWidget } from './summary-view-widget';
import { SummaryServiceImpl, SummaryService } from './summary-service';

export default new ContainerModule(bind => {
    bind(AiTerminalSummaryContribution).toSelf().inSingletonScope();
    for (const identifier of [CommandContribution, MenuContribution, KeybindingContribution]) {
        bind(identifier).toService(AiTerminalSummaryContribution);
    }

    bind(SummaryServiceImpl).toSelf().inSingletonScope();
    bind(SummaryService).toService(SummaryServiceImpl);

    bind(SummaryViewWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: SummaryViewWidget.ID,
        createWidget: () => ctx.container.get<SummaryViewWidget>(SummaryViewWidget)
    }));


    bind(AiTerminalSummaryAgent).toSelf().inSingletonScope();
    bind(Agent).toService(AiTerminalSummaryAgent);

});
