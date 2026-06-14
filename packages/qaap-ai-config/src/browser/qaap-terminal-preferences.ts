// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { PreferenceContribution, PreferenceSchema } from '@theia/core/lib/common/preferences';
import { injectable } from '@theia/core/shared/inversify';

export const QAAP_CONFIRM_LONG_TERMINAL_PREF = 'qaap.ai.confirmLongTerminal';

export const qaapTerminalPreferenceSchema: PreferenceSchema = {
    properties: {
        [QAAP_CONFIRM_LONG_TERMINAL_PREF]: {
            type: 'boolean',
            default: true,
            description: nls.localize(
                'qaap/preferences/confirmLongTerminal',
                'Ask for confirmation before starting long-running terminal commands (install, build, test suites).'
            ),
        },
    },
};

@injectable()
export class QaapTerminalPreferenceContribution implements PreferenceContribution {
    readonly schema = qaapTerminalPreferenceSchema;
}
