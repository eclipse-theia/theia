// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { TheiaSplitPanel } from '@theia/core/lib/browser';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';

/** Shell implementations that expose the left|center|right horizontal split (mobile layout). */
export interface QaapShellWithLeftRightSplit extends ApplicationShell {
    readonly leftRightSplitPanel: TheiaSplitPanel;
}

export function hasQaapLeftRightSplitPanel(shell: ApplicationShell): shell is QaapShellWithLeftRightSplit {
    return 'leftRightSplitPanel' in shell && !!(shell as QaapShellWithLeftRightSplit).leftRightSplitPanel;
}
