// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable } from '@theia/core/lib/common/disposable';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';

export interface TranscriptFilesMount {
    readonly root: HTMLElement;
    readonly dispose: Disposable;
}

export interface TranscriptTerminalSurface {
    readonly dispose: Disposable;
    readonly terminal: TerminalWidget;
    readonly mountHost: HTMLElement;
}
