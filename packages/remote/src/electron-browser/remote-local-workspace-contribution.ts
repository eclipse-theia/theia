// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { ILogger, MaybePromise, URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { WorkspaceHandlingContribution, WorkspaceInput, WorkspaceOpenHandlerContribution, WorkspacePreferences } from '@theia/workspace/lib/browser';
import { LOCAL_FILE_SCHEME } from './local-backend-services';
import { CURRENT_PORT_PARAM, LOCAL_PORT_PARAM, getCurrentPort, getLocalPort } from '@theia/core/lib/electron-browser/messaging/electron-local-ws-connection-source';
import { RemoteStatusService } from '../electron-common/remote-status-service';
import { WindowService } from '@theia/core/lib/browser/window/window-service';

@injectable()
export class RemoteLocalWorkspaceContribution implements WorkspaceOpenHandlerContribution, WorkspaceHandlingContribution {

    @inject(RemoteStatusService)
    protected readonly remoteStatusService: RemoteStatusService;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(ILogger)
    protected logger: ILogger;

    @inject(WorkspacePreferences)
    protected preferences: WorkspacePreferences;

    canHandle(uri: URI): boolean {
        return uri.scheme === LOCAL_FILE_SCHEME;
    }

    async modifyRecentWorksapces(workspaces: string[]): Promise<string[]> {
        return workspaces.map(workspace => {
            const uri = new URI(workspace);
            if (uri.scheme === 'file') {
                return uri.withScheme(LOCAL_FILE_SCHEME).toString();
            }
            // possible check as well if a remote/dev-container worksace is from the connected remote and therefore change it to the 'file' scheme
            return workspace;
        });
    }

    openWorkspace(uri: URI, options?: WorkspaceInput | undefined): MaybePromise<void> {
        const workspacePath = uri.path.toString();

        if (this.preferences['workspace.preserveWindow'] || (options && options.preserveWindow)) {
            this.reloadWindow(workspacePath);
        } else {
            try {
                this.openNewWindow(workspacePath);
            } catch (error) {
                this.logger.error(error.toString()).then(() => this.reloadWindow(workspacePath));
            }
        }
    }

    protected reloadWindow(workspacePath: string): void {
        const currentPort = getCurrentPort();
        this.remoteStatusService.connectionClosed(parseInt(currentPort ?? '0'));
        const searchParams = this.getModifiedUrl().searchParams;
        this.windowService.reload({ hash: encodeURI(workspacePath), search: Object.fromEntries(searchParams) });
    }

    protected openNewWindow(workspacePath: string): void {
        const url = this.getModifiedUrl();
        url.hash = encodeURI(workspacePath);
        this.windowService.openNewWindow(url.toString());
    }

    protected getModifiedUrl(): URL {
        const url = new URL(window.location.href);
        url.searchParams.set(CURRENT_PORT_PARAM, getLocalPort() ?? '');
        url.searchParams.delete(LOCAL_PORT_PARAM);
        return url;
    }
}
