// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { PreferenceService } from '@theia/core/lib/common';
import { DefaultShellCommandAnalyzer } from '@theia/ai-terminal/lib/common/shell-command-analyzer';
import { SHELL_COMMAND_ALLOWLIST_PREFERENCE } from '@theia/ai-terminal/lib/common/shell-command-preferences';
import { QaapShellCommandPermissionService } from './qaap-shell-command-permission-service';
import { QAAP_CONFIRM_LONG_TERMINAL_PREF } from './qaap-terminal-preferences';

describe('QaapShellCommandPermissionService', () => {

    function createService(options: {
        confirmLongTerminal?: boolean;
        allowlist?: string[];
    } = {}): QaapShellCommandPermissionService {
        const service = new QaapShellCommandPermissionService();
        (service as unknown as { preferenceService: PreferenceService }).preferenceService = {
            get: (key: string, defaultValue: unknown) => {
                if (key === QAAP_CONFIRM_LONG_TERMINAL_PREF) {
                    return options.confirmLongTerminal ?? true;
                }
                if (key === SHELL_COMMAND_ALLOWLIST_PREFERENCE) {
                    return options.allowlist ?? [];
                }
                return defaultValue;
            },
        } as PreferenceService;
        (service as unknown as { shellCommandAnalyzer: DefaultShellCommandAnalyzer }).shellCommandAnalyzer = new DefaultShellCommandAnalyzer();
        return service;
    }

    it('requires confirmation for long-running install commands', () => {
        const service = createService({ confirmLongTerminal: true });
        expect(service.checkCommand('pnpm install').allowed).to.equal(false);
        expect(service.checkCommand('npm run build').allowed).to.equal(false);
    });

    it('allows allowlisted long commands when confirmation is disabled', () => {
        const blocked = createService({ confirmLongTerminal: true, allowlist: ['pnpm install'] });
        const allowed = createService({ confirmLongTerminal: false, allowlist: ['pnpm install'] });
        expect(blocked.checkCommand('pnpm install').allowed).to.equal(false);
        expect(allowed.checkCommand('pnpm install').allowed).to.equal(true);
    });
});
