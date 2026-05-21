// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { nls } from '@theia/core/lib/common/nls';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { WindowBlinkService } from '@theia/ai-core/lib/browser/window-blink-service';
import { QaapProjectBootstrapService } from '@theia/qaap-mobile-shell/lib/browser/qaap-project-bootstrap-service';
import { QaapWindowBlinkService } from './qaap-window-blink-service';

export const QAAP_BOOTSTRAP_FAILED_EVENT = 'qaap-bootstrap-failed';
export const QAAP_AGENT_COMPLETED_EVENT = 'qaap-agent-completed';

@injectable()
export class QaapPushNotificationContribution implements FrontendApplicationContribution {

    @inject(WindowBlinkService)
    protected readonly blink: WindowBlinkService;

    @inject(QaapProjectBootstrapService)
    protected readonly bootstrap: QaapProjectBootstrapService;

    onStart(): void {
        this.bootstrap.onStateChange(state => {
            if (state.phase === 'install-failed' || state.phase === 'run-failed') {
                this.notifyBuildFailed(state.error);
                window.dispatchEvent(new CustomEvent(QAAP_BOOTSTRAP_FAILED_EVENT, { detail: { error: state.error } }));
            }
            if (state.phase === 'running') {
                void this.requestNotificationPermission();
            }
        });
        window.addEventListener(QAAP_AGENT_COMPLETED_EVENT, this.onAgentCompleted);
    }

    onStop(): void {
        window.removeEventListener(QAAP_AGENT_COMPLETED_EVENT, this.onAgentCompleted);
    }

    protected readonly onAgentCompleted = (event: Event): void => {
        const detail = (event as CustomEvent<{ agentName?: string }>).detail;
        this.notifyAgentCompleted(detail?.agentName);
    };

    protected notifyAgentCompleted(agentName?: string): void {
        if (this.blink instanceof QaapWindowBlinkService) {
            this.blink.notifyAgentCompleted(agentName);
        } else {
            void this.blink.blinkWindow(agentName);
        }
        this.showSystemNotification(
            nls.localize('qaap/push/agentDone', 'Agent finished'),
            agentName
                ? nls.localize('qaap/push/agentDoneBody', '{0} completed its task.', agentName)
                : nls.localize('qaap/push/agentDoneBodyGeneric', 'Your agent completed its task.'),
        );
    }

    protected notifyBuildFailed(error?: string): void {
        if (this.blink instanceof QaapWindowBlinkService) {
            this.blink.notifyBuildFailed(error);
        }
        this.showSystemNotification(
            nls.localize('qaap/push/buildFailed', 'Build failed'),
            error ?? nls.localize('qaap/push/buildFailedBody', 'Check the terminal output and retry.'),
        );
    }

    protected showSystemNotification(title: string, body: string): void {
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
            return;
        }
        try {
            new Notification(title, { body, tag: 'qaap-product' });
        } catch {
            /* iOS / restricted contexts */
        }
    }

    protected async requestNotificationPermission(): Promise<void> {
        if (typeof Notification === 'undefined' || Notification.permission !== 'default') {
            return;
        }
        try {
            await Notification.requestPermission();
        } catch {
            /* user dismissed */
        }
    }
}
