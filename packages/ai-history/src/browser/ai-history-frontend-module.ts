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
import { bindViewContribution, WidgetFactory } from '@theia/core/lib/browser';
import { AIHistoryViewContribution } from './ai-history-contribution';
import { AIHistoryView } from './ai-history-widget';
import '../../src/browser/style/ai-history.css';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';

export default new ContainerModule(bind => {
    bindViewContribution(bind, AIHistoryViewContribution);

    bind(AIHistoryView).toSelf();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: AIHistoryView.ID,
        createWidget: () => context.container.get<AIHistoryView>(AIHistoryView)
    })).inSingletonScope();
    bind(TabBarToolbarContribution).toService(AIHistoryViewContribution);
});
