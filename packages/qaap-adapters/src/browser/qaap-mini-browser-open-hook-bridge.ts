// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { MiniBrowser } from '@theia/mini-browser/lib/browser/mini-browser';
import { MiniBrowserOpenHook } from '@theia/mini-browser/lib/browser/mini-browser-open-hook';
import { MiniBrowserOpenerOptions } from '@theia/mini-browser/lib/browser/mini-browser-opener-options';
import { QaapMiniBrowserLifecycle } from './qaap-mini-browser-lifecycle';

@injectable()
export class QaapMiniBrowserOpenHookBridge implements MiniBrowserOpenHook {

    @inject(QaapMiniBrowserLifecycle)
    protected readonly lifecycle: QaapMiniBrowserLifecycle;

    afterOpen(widget: MiniBrowser, options?: MiniBrowserOpenerOptions): void {
        this.lifecycle.afterOpen(widget, options);
    }
}
