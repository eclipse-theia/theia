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

    /** Agent task completed — tab title + optional system notification (see push contribution). */
    notifyAgentCompleted(agentName?: string): void {
        void this.blinkWindow(agentName);
    }

    /** Bootstrap install/run failed. */
    notifyBuildFailed(_error?: string): void {
        if (typeof document !== 'undefined') {
            const app = FrontendApplicationConfigProvider.get().applicationName;
            document.title = '⚠ ' + nls.localize('qaap/blink/buildFailed', '{0} — build failed', app);
        }
    }

    /** Agent is paused waiting for the user to approve a tool call. */
    notifyAgentNeedsConfirmation(agentName?: string): void {
        void this.blinkWindow(agentName);
    }
}
