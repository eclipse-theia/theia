// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, postConstruct } from 'inversify';
import { NewWindowOptions, WindowSearchParams } from '../../common/window';
import { DefaultWindowService } from '../../browser/window/default-window-service';
import { ElectronMainWindowService } from '../../electron-common/electron-main-window-service';
import { ElectronWindowPreferences } from './electron-window-preferences';
import { ConnectionCloseService } from '../../common/messaging/connection-management';
import { FrontendIdProvider } from '../../browser/messaging/frontend-id-provider';
import { WindowReloadOptions } from '../../browser/window/window-service';

@injectable()
export class ElectronWindowService extends DefaultWindowService {

    /**
     * Lock to prevent multiple parallel executions of the `beforeunload` listener.
     */
    protected isUnloading: boolean = false;

    /**
     * Close the window right away when `true`, else check if we can unload.
     */
    protected closeOnUnload: boolean = false;

    @inject(FrontendIdProvider)
    protected readonly frontendIdProvider: FrontendIdProvider;

    @inject(ElectronMainWindowService)
    protected readonly delegate: ElectronMainWindowService;

    @inject(ElectronWindowPreferences)
    protected readonly electronWindowPreferences: ElectronWindowPreferences;

    @inject(ConnectionCloseService)
    protected readonly connectionCloseService: ConnectionCloseService;

    override openNewWindow(url: string, { external }: NewWindowOptions = {}): undefined {
        this.delegate.openNewWindow(url, { external });
        return undefined;
    }

    override openNewDefaultWindow(params?: WindowSearchParams): void {
        this.delegate.openNewDefaultWindow(params);
    }

    override focus(): void {
        window.electronTheiaCore.focusWindow();
    }
    @postConstruct()
    protected init(): void {
        // Update the default zoom level on startup when the preferences event is fired.
        this.electronWindowPreferences.onPreferenceChanged(e => {
            if (e.preferenceName === 'window.zoomLevel') {
                this.updateWindowZoomLevel();
            }
        });
        window.electronTheiaCore.onAboutToClose(() => {
            this.connectionCloseService.markForClose(this.frontendIdProvider.getId());
        });
    }

    protected override registerUnloadListeners(): void {
        window.electronTheiaCore.setCloseRequestHandler(reason => this.isSafeToShutDown(reason));
        window.addEventListener('unload', () => {
            this.onUnloadEmitter.fire();
        });
    }

    /**
     * Updates the window zoom level based on the preference value.
     */
    protected async updateWindowZoomLevel(): Promise<void> {
        const preferredZoomLevel = this.electronWindowPreferences['window.zoomLevel'];
        if (await window.electronTheiaCore.getZoomLevel() !== preferredZoomLevel) {
            window.electronTheiaCore.setZoomLevel(preferredZoomLevel);
        }
    }

    override reload(params?: WindowReloadOptions): void {
        if (params) {
            const newLocation = new URL(location.href);
            if (params.search) {
                const query = Object.entries(params.search).map(([name, value]) => `${name}=${value}`).join('&');
                newLocation.search = query;
            }
            if (params.hash) {
                newLocation.hash = '#' + params.hash;
            }
            window.electronTheiaCore.requestReload(newLocation.toString());
        } else {
            window.electronTheiaCore.requestReload();
        }
    }
}

