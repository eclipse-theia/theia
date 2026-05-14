// *****************************************************************************
// Copyright (C) 2026 theia-ide and others.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { MiniBrowser } from './mini-browser';
import { MiniBrowserOpenerOptions } from './mini-browser-opener-options';

/**
 * Product / platform hook after a {@link MiniBrowser} instance is opened.
 * Default is no-op; Qaap rebinding can re-run navigation once the shell has laid out geometry.
 */
export const MiniBrowserOpenHook = Symbol('MiniBrowserOpenHook');

export interface MiniBrowserOpenHook {
    afterOpen(widget: MiniBrowser, options?: MiniBrowserOpenerOptions): void;
}

@injectable()
export class DefaultMiniBrowserOpenHook implements MiniBrowserOpenHook {
    afterOpen(): void {
        /* no-op */
    }
}
