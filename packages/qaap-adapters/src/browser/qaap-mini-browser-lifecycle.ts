// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { MiniBrowser } from '@theia/mini-browser/lib/browser/mini-browser';
import { MiniBrowserOpenerOptions } from '@theia/mini-browser/lib/browser/mini-browser-opener-options';

export const QaapMiniBrowserLifecycle = Symbol('QaapMiniBrowserLifecycle');

export interface QaapMiniBrowserLifecycle {
    afterOpen(widget: MiniBrowser, options?: MiniBrowserOpenerOptions): void;
}
