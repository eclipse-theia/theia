// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { QaapProjectBootstrapService } from '@theia/qaap-mobile-shell/lib/browser/qaap-project-bootstrap-service';

/** Must match mobile-shell push contribution event names. */
const QAAP_BOOTSTRAP_FAILED_EVENT = 'qaap-bootstrap-failed';
const QAAP_AGENT_COMPLETED_EVENT = 'qaap-agent-completed';
const QAAP_AGENT_CONFIRMATION_NEEDED_EVENT = 'qaap-agent-confirmation-needed';
import { fetchQaapPushVapid, sendQaapPushNotify, subscribeQaapWebPush } from './qaap-cloud-workspace-client';

@injectable()
export class QaapWebPushContribution implements FrontendApplicationContribution {

    @inject(QaapProjectBootstrapService)
    protected readonly bootstrap: QaapProjectBootstrapService;

    onStart(): void {
        void this.registerWebPushSubscription();
        this.bootstrap.onStateChange(state => {
            if (state.phase === 'install-failed' || state.phase === 'run-failed') {
                void sendQaapPushNotify({
                    title: 'Build failed',
                    body: state.error ?? 'Check the terminal output and retry.',
                    tag: 'qaap-build-failed',
                });
            }
        });
        window.addEventListener(QAAP_BOOTSTRAP_FAILED_EVENT, this.onBootstrapFailed);
        window.addEventListener(QAAP_AGENT_COMPLETED_EVENT, this.onAgentCompleted);
        window.addEventListener(QAAP_AGENT_CONFIRMATION_NEEDED_EVENT, this.onConfirmationNeeded);
    }

    onStop(): void {
        window.removeEventListener(QAAP_BOOTSTRAP_FAILED_EVENT, this.onBootstrapFailed);
        window.removeEventListener(QAAP_AGENT_COMPLETED_EVENT, this.onAgentCompleted);
        window.removeEventListener(QAAP_AGENT_CONFIRMATION_NEEDED_EVENT, this.onConfirmationNeeded);
    }

    protected readonly onBootstrapFailed = (): void => {
        void sendQaapPushNotify({
            title: 'Build failed',
            body: 'Check the terminal output and retry.',
            tag: 'qaap-build-failed',
        });
    };

    protected readonly onAgentCompleted = (event: Event): void => {
        // Only push when the app is backgrounded/locked — a foreground tab already shows the
        // in-app notification, so a system push would be redundant noise.
        if (document.visibilityState === 'visible') {
            return;
        }
        const detail = (event as CustomEvent<{ agentName?: string }>).detail;
        void sendQaapPushNotify({
            title: 'Agent finished',
            body: detail?.agentName
                ? `${detail.agentName} completed its task.`
                : 'Your agent completed its task.',
            tag: 'qaap-agent-done',
            route: 'diff-review',
        });
    };

    protected readonly onConfirmationNeeded = (event: Event): void => {
        // The agent is blocked waiting on the user — always push, even if the tab is foregrounded
        // but the OS has hidden it (split-screen, screen off). Same `tag` collapses repeats from
        // chained confirmations into a single visible notification.
        const detail = (event as CustomEvent<{ agentName?: string }>).detail;
        if (document.visibilityState === 'visible' && !document.hidden) {
            return;
        }
        void sendQaapPushNotify({
            title: 'Agent needs your confirmation',
            body: detail?.agentName
                ? `${detail.agentName} is waiting for you to approve a tool call.`
                : 'Your agent is waiting for you to approve a tool call.',
            tag: 'qaap-agent-confirm',
            route: 'chat',
        });
    };

    protected async registerWebPushSubscription(): Promise<void> {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            return;
        }
        const vapid = await fetchQaapPushVapid();
        if (!vapid.enabled || !vapid.publicKey) {
            return;
        }
        try {
            const registration = await navigator.serviceWorker.ready;
            let subscription = await registration.pushManager.getSubscription();
            if (!subscription) {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
                });
            }
            const json = subscription.toJSON();
            if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
                return;
            }
            await subscribeQaapWebPush({
                subscription: {
                    endpoint: json.endpoint,
                    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
                },
            });
        } catch (err) {
            console.warn('[qaap] Web Push subscription failed', err);
        }
    }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const buffer = new ArrayBuffer(raw.length);
    const output = new Uint8Array(buffer);
    for (let i = 0; i < raw.length; i++) {
        output[i] = raw.charCodeAt(i);
    }
    return output;
}
