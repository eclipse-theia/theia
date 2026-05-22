// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import type { QaapPushNotifyRequest } from '../common/qaap-cloud-api-types';
import { QaapPushSubscriptionStore } from './qaap-push-subscription-store';

@injectable()
export class QaapWebPushService {

    @inject(QaapPushSubscriptionStore)
    protected readonly subscriptions: QaapPushSubscriptionStore;

    isConfigured(): boolean {
        return Boolean(
            process.env.QAAP_VAPID_PUBLIC_KEY?.trim()
            && process.env.QAAP_VAPID_PRIVATE_KEY?.trim(),
        );
    }

    getPublicKey(): string {
        return process.env.QAAP_VAPID_PUBLIC_KEY?.trim() ?? '';
    }

    async notify(request: QaapPushNotifyRequest): Promise<{ sent: number; failed: number }> {
        if (!this.isConfigured()) {
            return { sent: 0, failed: 0 };
        }
        const webpush = await import('web-push');
        webpush.setVapidDetails(
            process.env.QAAP_VAPID_SUBJECT?.trim() || 'mailto:qaap@localhost',
            this.getPublicKey(),
            process.env.QAAP_VAPID_PRIVATE_KEY!.trim(),
        );
        const targets = request.userLogin
            ? await this.subscriptions.listForUser(request.userLogin)
            : await this.subscriptions.listAll();
        let sent = 0;
        let failed = 0;
        const payload = JSON.stringify({
            title: request.title,
            body: request.body,
            tag: request.tag,
            route: request.route,
        });
        for (const row of targets) {
            try {
                await webpush.sendNotification(row.subscription, payload);
                sent++;
            } catch {
                failed++;
            }
        }
        return { sent, failed };
    }
}
