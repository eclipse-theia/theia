// *****************************************************************************
// Copyright (C) 2026 Robert Jandow
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

import { nls } from '@theia/core/lib/common/nls';
import { injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { LocalFolderCommands } from '@theia/workspace/lib/browser-only/local-folder-frontend-contribution';
import { GettingStartedWidget } from '../browser/getting-started-widget';

/**
 * Adds an action to open a folder of the local file system, as the browser-only "Open" action only covers the OPFS.
 */
@injectable()
export class BrowserOnlyGettingStartedWidget extends GettingStartedWidget {

    protected override renderAdditionalStartActions(): React.ReactNode {
        // The command is only visible if the browser supports the File System Access API.
        if (!this.commandRegistry.isVisible(LocalFolderCommands.OPEN_LOCAL_FOLDER.id)) {
            return undefined;
        }
        return <div className='gs-action-container'>
            <a
                role={'button'}
                tabIndex={0}
                onClick={this.doOpenLocalFolder}
                onKeyDown={this.doOpenLocalFolderEnter}>
                {nls.localize('theia/getting-started/openLocalFolder', 'Open Local Folder')}
            </a>
        </div>;
    }

    /**
     * Trigger the open local folder command.
     */
    protected doOpenLocalFolder = () => this.commandRegistry.executeCommand(LocalFolderCommands.OPEN_LOCAL_FOLDER.id);
    protected doOpenLocalFolderEnter = (e: React.KeyboardEvent) => {
        if (this.isEnterKey(e)) {
            this.doOpenLocalFolder();
        }
    };
}
