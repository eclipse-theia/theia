// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { injectable } from '@theia/core/shared/inversify';
import { WindowBlinkService } from '@theia/ai-core/lib/browser/window-blink-service';

@injectable()
export class QaapWindowBlinkService extends WindowBlinkService {

    protected override getBlinkAlertTitle(agentName?: string): string {
        const app = FrontendApplicationConfigProvider.get().applicationName;
        return '🔔 ' + (agentName
            ? nls.localize('theia/ai/core/blinkTitle/namedAgentCompleted', '{0} - Agent "{1}" Completed', app, agentName)
            : nls.localize('theia/ai/core/blinkTitle/agentCompleted', '{0} - Agent Completed', app));
    }
}
