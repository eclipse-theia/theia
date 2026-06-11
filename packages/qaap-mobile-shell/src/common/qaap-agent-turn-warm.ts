// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { warmAgentRunner } from './qaap-agent-task-client';

export interface QaapAgentTurnWarmHooks {
    warmLiveTransport?(): void;
}

/** Pre-connect live transport and warm the VPS agent runner before the user sends. */
export function warmAgentTurnPath(cwd: string | undefined, hooks: QaapAgentTurnWarmHooks): void {
    hooks.warmLiveTransport?.();
    const trimmed = cwd?.trim();
    if (!trimmed) {
        return;
    }
    void warmAgentRunner(trimmed);
}
