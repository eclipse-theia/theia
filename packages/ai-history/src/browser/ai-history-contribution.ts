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
import { FrontendApplication } from '@theia/core/lib/browser';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { injectable } from '@theia/core/shared/inversify';
import { AIHistoryView } from './ai-history-widget';

export const AI_HISTORY_TOGGLE_COMMAND_ID = 'aiHistory:toggle';

@injectable()
export class AIHistoryViewContribution extends AbstractViewContribution<AIHistoryView> {
    constructor() {
        super({
            widgetId: AIHistoryView.ID,
            widgetName: AIHistoryView.LABEL,
            defaultWidgetOptions: {
                area: 'bottom',
                rank: 100
            },
            toggleCommandId: AI_HISTORY_TOGGLE_COMMAND_ID,
        });
    }

    async initializeLayout(_app: FrontendApplication): Promise<void> {
        await this.openView();
    }
}
