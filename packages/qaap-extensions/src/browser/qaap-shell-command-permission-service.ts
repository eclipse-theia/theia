// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import {
    CommandCheckResult,
    ShellCommandPermissionService,
} from '@theia/ai-terminal/lib/browser/shell-command-permission-service';
import { QAAP_CONFIRM_LONG_TERMINAL_PREF } from './qaap-ai-preference-branding-contribution';

const LONG_RUNNING_COMMAND_PATTERNS: RegExp[] = [
    /\b(npm|pnpm|yarn|bun)\s+(install|ci|run\s+(build|test|e2e|lint|dev)|exec)\b/i,
    /\b(npx|pnpm\s+exec|yarn)\s+(playwright|jest|vitest|mocha|cypress)\b/i,
    /\b(tsc|webpack|vite\s+build|next\s+build|turbo\s+run)\b/i,
    /\b(pytest|cargo\s+build|go\s+test|gradle\s+build|mvn\s+(clean|install|test))\b/i,
    /\b(docker\s+(build|compose|run)|podman\s+build)\b/i,
];

/** When enabled, long-running install/build/test commands always require shell confirmation. */
@injectable()
export class QaapShellCommandPermissionService extends ShellCommandPermissionService {

    override checkCommand(command: string): CommandCheckResult {
        if (this.shouldConfirmLongTerminal(command)) {
            return { allowed: false, reason: 'not-allowed' };
        }
        return super.checkCommand(command);
    }

    protected shouldConfirmLongTerminal(command: string): boolean {
        if (!this.preferenceService.get<boolean>(QAAP_CONFIRM_LONG_TERMINAL_PREF, true)) {
            return false;
        }
        const trimmed = command.trim();
        if (!trimmed) {
            return false;
        }
        return LONG_RUNNING_COMMAND_PATTERNS.some(pattern => pattern.test(trimmed));
    }
}
