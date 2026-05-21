// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type {
    QaapCloudWorkspaceEnsureRequest,
    QaapCloudWorkspaceSummary,
} from '../common/qaap-cloud-api-types';

const STORE_PATH = path.join(os.homedir(), '.qaap', 'cloud-workspaces.json');

export function qaapCloudProviderMode(): QaapCloudWorkspaceSummary['provider'] {
    const mode = process.env.QAAP_CLOUD_MODE?.trim() || 'local';
    if (mode === 'docker') {
        return 'docker';
    }
    if (mode === 'remote') {
        return 'remote';
    }
    return 'local-sandbox';
}

@injectable()
export class QaapCloudWorkspaceStore {

    async list(): Promise<QaapCloudWorkspaceSummary[]> {
        const all = await this.readAll();
        return Object.values(all).sort((a, b) =>
            (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? ''));
    }

    async ensure(request: QaapCloudWorkspaceEnsureRequest): Promise<QaapCloudWorkspaceSummary> {
        const all = await this.readAll();
        const existing = Object.values(all).find(w => w.repoKey === request.repoKey);
        if (existing) {
            const updated: QaapCloudWorkspaceSummary = {
                ...existing,
                workspaceUri: request.workspaceUri ?? existing.workspaceUri,
                lastOpenedAt: new Date().toISOString(),
                status: 'ready',
            };
            all[existing.id] = updated;
            await this.writeAll(all);
            return updated;
        }
        const row: QaapCloudWorkspaceSummary = {
            id: `cw_${crypto.randomBytes(8).toString('hex')}`,
            repoKey: request.repoKey,
            status: 'ready',
            provider: qaapCloudProviderMode(),
            workspaceUri: request.workspaceUri,
            lastOpenedAt: new Date().toISOString(),
        };
        all[row.id] = row;
        await this.writeAll(all);
        return row;
    }

    async ensureWithContainer(
        request: QaapCloudWorkspaceEnsureRequest,
        patch: Partial<Pick<QaapCloudWorkspaceSummary, 'containerRef' | 'status' | 'provider' | 'error'>>,
    ): Promise<QaapCloudWorkspaceSummary> {
        const all = await this.readAll();
        const existing = Object.values(all).find(w => w.repoKey === request.repoKey);
        const base: QaapCloudWorkspaceSummary = existing ?? {
            id: `cw_${crypto.randomBytes(8).toString('hex')}`,
            repoKey: request.repoKey,
            status: 'provisioning',
            provider: qaapCloudProviderMode(),
            workspaceUri: request.workspaceUri,
            lastOpenedAt: new Date().toISOString(),
        };
        const updated: QaapCloudWorkspaceSummary = {
            ...base,
            workspaceUri: request.workspaceUri ?? base.workspaceUri,
            lastOpenedAt: new Date().toISOString(),
            ...patch,
        };
        all[updated.id] = updated;
        await this.writeAll(all);
        return updated;
    }

    async updatePreviewPort(repoKey: string, port: number): Promise<void> {
        const all = await this.readAll();
        for (const [id, row] of Object.entries(all)) {
            if (row.repoKey === repoKey) {
                all[id] = { ...row, previewPort: port, lastOpenedAt: new Date().toISOString() };
                await this.writeAll(all);
                return;
            }
        }
    }

    protected async readAll(): Promise<Record<string, QaapCloudWorkspaceSummary>> {
        try {
            const raw = await fs.readFile(STORE_PATH, 'utf8');
            const parsed = JSON.parse(raw) as Record<string, QaapCloudWorkspaceSummary>;
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }

    protected async writeAll(data: Record<string, QaapCloudWorkspaceSummary>): Promise<void> {
        await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
        await fs.writeFile(STORE_PATH, JSON.stringify(data, undefined, 2), 'utf8');
    }
}
