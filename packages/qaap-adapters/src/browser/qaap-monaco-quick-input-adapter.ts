// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ApplicationShell } from '@theia/core/lib/browser/shell';

export const QaapMonacoQuickInputAdapter = Symbol('QaapMonacoQuickInputAdapter');

export interface QaapMonacoQuickInputAdapter {
    synchronize(shell: ApplicationShell, container: HTMLElement, defaultSync: () => void): void;
}
