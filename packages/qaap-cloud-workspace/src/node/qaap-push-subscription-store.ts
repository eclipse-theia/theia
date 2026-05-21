// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { QaapPushSubscriptionJson } from '../common/qaap-cloud-api-types';

const STORE_PATH = path.join(os.homedir(), '.qaap', 'push-subscriptions.json');

export interface StoredPushSubscription {
    readonly userLogin: string;
    readonly subscription: QaapPushSubscriptionJson;
    readonly createdAt: string;
}

@injectable()
export class QaapPushSubscriptionStore {

    async upsert(userLogin: string, subscription: QaapPushSubscriptionJson): Promise<void> {
        const all = await this.readAll();
        const key = subscription.endpoint;
        all[key] = {
            userLogin,
            subscription,
            createdAt: new Date().toISOString(),
        };
        await this.writeAll(all);
    }

    async listForUser(userLogin: string): Promise<StoredPushSubscription[]> {
        const all = await this.readAll();
        return Object.values(all).filter(row => row.userLogin === userLogin);
    }

    async listAll(): Promise<StoredPushSubscription[]> {
        return Object.values(await this.readAll());
    }

    protected async readAll(): Promise<Record<string, StoredPushSubscription>> {
        try {
            const raw = await fs.readFile(STORE_PATH, 'utf8');
            const parsed = JSON.parse(raw) as Record<string, StoredPushSubscription>;
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }

    protected async writeAll(data: Record<string, StoredPushSubscription>): Promise<void> {
        await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
        await fs.writeFile(STORE_PATH, JSON.stringify(data, undefined, 2), 'utf8');
    }
}
