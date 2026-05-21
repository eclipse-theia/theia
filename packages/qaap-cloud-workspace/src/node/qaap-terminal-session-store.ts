// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type {
    QaapTerminalSessionRecord,
    QaapTerminalSessionsUpsertRequest,
} from '../common/qaap-cloud-api-types';

const STORE_PATH = path.join(os.homedir(), '.qaap', 'terminal-sessions.json');

@injectable()
export class QaapTerminalSessionStore {

    async get(workspaceKey: string): Promise<QaapTerminalSessionRecord[]> {
        const all = await this.readAll();
        return all[workspaceKey]?.terminals ?? [];
    }

    async upsert(request: QaapTerminalSessionsUpsertRequest): Promise<void> {
        const all = await this.readAll();
        all[request.workspaceKey] = {
            updatedAt: new Date().toISOString(),
            terminals: request.terminals,
        };
        await this.writeAll(all);
    }

    protected async readAll(): Promise<Record<string, { updatedAt: string; terminals: QaapTerminalSessionRecord[] }>> {
        try {
            const raw = await fs.readFile(STORE_PATH, 'utf8');
            const parsed = JSON.parse(raw) as Record<string, { updatedAt: string; terminals: QaapTerminalSessionRecord[] }>;
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }

    protected async writeAll(
        data: Record<string, { updatedAt: string; terminals: QaapTerminalSessionRecord[] }>,
    ): Promise<void> {
        await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
        await fs.writeFile(STORE_PATH, JSON.stringify(data, undefined, 2), 'utf8');
    }
}
