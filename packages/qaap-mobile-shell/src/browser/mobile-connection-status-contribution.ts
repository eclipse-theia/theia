// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { ConnectionStatus, ConnectionStatusService } from '@theia/core/lib/browser/connection-status-service';
import { matchesMobileNarrowViewport } from '@theia/core/lib/browser/shell/mobile-layout-state';
import { nls } from '@theia/core/lib/common';
import { MobileSnackbar } from './mobile-snackbar';

/**
 * Surfaces backend reconnection state on the narrow-viewport workbench. The
 * desktop status-bar pill is easy to miss on a phone, so we mirror the
 * `ConnectionStatusService` to a `MobileSnackbar` toast: a sticky
 * "Reconnecting…" loader while offline, and a brief "Back online" success
 * toast once the channel resumes. Pairs with the bumped
 * `frontendConnectionTimeout` (10 min) so that a backgrounded tab can come
 * back without losing its plugin host — the user sees what's happening.
 */
@injectable()
export class MobileConnectionStatusContribution implements FrontendApplicationContribution {

    @inject(ConnectionStatusService)
    protected readonly connectionStatusService: ConnectionStatusService;

    protected wasOffline = false;

    onStart(): void {
        this.connectionStatusService.onStatusChange(status => this.handleStatusChange(status));
    }

    protected handleStatusChange(status: ConnectionStatus): void {
        if (!matchesMobileNarrowViewport()) {
            return;
        }
        if (status === ConnectionStatus.OFFLINE) {
            this.wasOffline = true;
            MobileSnackbar.show(
                nls.localize('theia/qaap-mobile-shell/reconnecting', 'Reconnecting…'),
                { kind: 'loading', duration: 0 }
            );
        } else if (this.wasOffline) {
            this.wasOffline = false;
            MobileSnackbar.show(
                nls.localize('theia/qaap-mobile-shell/backOnline', 'Back online'),
                { kind: 'success', duration: 1800 }
            );
        }
    }
}
