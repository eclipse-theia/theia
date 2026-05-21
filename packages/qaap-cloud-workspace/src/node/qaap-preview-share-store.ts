// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { buildQaapPublicPreviewShareUrl } from '../common/qaap-preview-share';
import type { QaapPreviewShareSummary } from '../common/qaap-cloud-api-types';

export interface QaapPreviewShareEntry {
    readonly token: string;
    readonly port: number;
    readonly repoKey?: string;
    readonly createdAt: string;
}

const STORE_PATH = path.join(os.homedir(), '.qaap', 'preview-shares.json');

@injectable()
export class QaapPreviewShareStore {

    async create(port: number, repoKey: string | undefined, publicOrigin: string): Promise<QaapPreviewShareSummary> {
        const token = crypto.randomBytes(12).toString('base64url');
        const publicUrl = buildQaapPublicPreviewShareUrl(publicOrigin, token);
        const entry: QaapPreviewShareEntry = {
            token,
            port,
            repoKey,
            createdAt: new Date().toISOString(),
        };
        const all = await this.readAll();
        all[token] = entry;
        await this.writeAll(all);
        return { token, port, publicUrl, createdAt: entry.createdAt };
    }

    async resolve(token: string): Promise<QaapPreviewShareEntry | undefined> {
        const all = await this.readAll();
        return all[token];
    }

    protected async readAll(): Promise<Record<string, QaapPreviewShareEntry>> {
        try {
            const raw = await fs.readFile(STORE_PATH, 'utf8');
            const parsed = JSON.parse(raw) as Record<string, QaapPreviewShareEntry>;
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }

    protected async writeAll(data: Record<string, QaapPreviewShareEntry>): Promise<void> {
        await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
        await fs.writeFile(STORE_PATH, JSON.stringify(data, undefined, 2), 'utf8');
    }
}
