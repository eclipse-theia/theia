// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import * as fs from 'fs';
import * as path from 'path';
import { ShellExecutionServerImpl } from '@theia/ai-terminal/lib/node/shell-execution-server-impl';
import { ShellExecutionRequest, ShellExecutionResult } from '@theia/ai-terminal/lib/common/shell-execution-server';

/**
 * Adds product-level resilience against common LLM `cwd` mistakes:
 *
 * 1. If the model passes the project's basename as a relative `cwd`, treat it as the workspace root.
 *    The naive `path.resolve(workspaceRoot, basename)` would point at a non-existent nested directory
 *    and surface as the misleading `spawn /bin/sh ENOENT` error.
 * 2. If the joined directory does not exist on disk, fall back to the workspace root so the agent
 *    gets a sensible response instead of an opaque shell error.
 * 3. If a real ENOENT still leaks through, rewrite the error message to explicitly point at the bad cwd.
 */
@injectable()
export class QaapShellExecutionServerImpl extends ShellExecutionServerImpl {

    override async execute(request: ShellExecutionRequest): Promise<ShellExecutionResult> {
        const result = await super.execute(request);
        if (!result.success && result.error && /ENOENT/.test(result.error) && result.resolvedCwd) {
            let cwdExists = false;
            try {
                cwdExists = fs.statSync(result.resolvedCwd).isDirectory();
            } catch {
                cwdExists = false;
            }
            if (!cwdExists) {
                return {
                    ...result,
                    error: `Working directory does not exist: ${result.resolvedCwd}. ` +
                        'Pass a different cwd (or omit it to use the workspace root).'
                };
            }
        }
        return result;
    }

    protected override resolveCwd(requestedCwd: string | undefined, workspaceRoot: string | undefined): string | undefined {
        if (!requestedCwd) {
            return workspaceRoot;
        }
        if (path.isAbsolute(requestedCwd)) {
            return requestedCwd;
        }
        if (!workspaceRoot) {
            return requestedCwd;
        }
        if (requestedCwd === path.basename(workspaceRoot) || requestedCwd === `./${path.basename(workspaceRoot)}`) {
            return workspaceRoot;
        }
        const candidate = path.resolve(workspaceRoot, requestedCwd);
        try {
            if (fs.statSync(candidate).isDirectory()) {
                return candidate;
            }
        } catch {
            // candidate doesn't exist or isn't accessible
        }
        return workspaceRoot;
    }
}
