// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ILogger } from '@theia/core/lib/common/logger';
import { inject, injectable } from '@theia/core/shared/inversify';
import { WebviewResourceCache } from '@theia/plugin-ext/lib/main/browser/webview/webview-resource-cache';

/**
 * Hardens upstream {@link WebviewResourceCache} for non-secure / cloud contexts:
 *
 * - The Cache Storage API is only exposed in secure contexts (HTTPS or localhost). In other
 *   contexts `caches` is `undefined`; opening a cache there throws a noisy ReferenceError.
 * - Errors from `caches.open(...)` are logged at debug level (graceful-degradation path:
 *   webviews still work, only the resource cache is unavailable).
 */
@injectable()
export class QaapWebviewResourceCache extends WebviewResourceCache {

    @inject(ILogger)
    protected readonly logger: ILogger;

    protected override async resolveCache(): Promise<void> {
        if (typeof caches === 'undefined') {
            this.cache.resolve(undefined);
            return;
        }
        try {
            this.cache.resolve(await caches.open('webview:v1'));
        } catch (e) {
            this.logger.debug('Webview resource cache unavailable', e);
            this.cache.resolve(undefined);
        }
    }
}
