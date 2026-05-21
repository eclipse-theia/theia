// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { FileUri } from '@theia/core/lib/node';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const QAAP_WORKSPACES_ROOT = process.env.QAAP_REPOS_ROOT
    || (process.env.NODE_ENV === 'production' ? '/workspace/repos' : path.join(os.homedir(), '.qaap', 'workspaces'));

const BUNDLED_TEMPLATE_IDS = new Set(['vite-react', 'next-app']);

/** Copies bundled Qaap starters from package resources into a local workspace folder. */
@injectable()
export class QaapTemplateScaffold {

    isBundledTemplate(templateId: string): boolean {
        return BUNDLED_TEMPLATE_IDS.has(templateId);
    }

    resolveTemplatesRoot(): string {
        return path.join(__dirname, '..', '..', 'resources', 'qaap-templates');
    }

    async scaffold(templateId: string, projectName?: string): Promise<string> {
        if (!BUNDLED_TEMPLATE_IDS.has(templateId)) {
            throw new Error(`Unknown bundled template: ${templateId}`);
        }
        const sourceDir = path.join(this.resolveTemplatesRoot(), templateId);
        await fs.access(sourceDir);
        const safeName = (projectName?.trim() || templateId).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 48);
        const folderName = `qaap-${safeName}-${Date.now()}`;
        const targetDir = path.join(QAAP_WORKSPACES_ROOT, folderName);
        await fs.mkdir(QAAP_WORKSPACES_ROOT, { recursive: true });
        await this.copyDir(sourceDir, targetDir);
        return FileUri.create(targetDir).toString();
    }

    protected async copyDir(source: string, target: string): Promise<void> {
        await fs.mkdir(target, { recursive: true });
        const entries = await fs.readdir(source, { withFileTypes: true });
        for (const entry of entries) {
            const from = path.join(source, entry.name);
            const to = path.join(target, entry.name);
            if (entry.isDirectory()) {
                await this.copyDir(from, to);
            } else if (entry.isFile()) {
                await fs.copyFile(from, to);
            }
        }
    }
}
