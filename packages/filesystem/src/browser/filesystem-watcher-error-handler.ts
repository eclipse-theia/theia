/********************************************************************************
 * Copyright (C) 2020 Arm and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject } from '@theia/core/shared/inversify';
import { environment } from '@theia/core/shared/@theia/application-package/lib/environment';
import { MessageService } from '@theia/core';
import { WindowService } from '@theia/core/lib/browser/window/window-service';

@injectable()
export class FileSystemWatcherErrorHandler {

    @inject(MessageService) protected readonly messageService: MessageService;
    @inject(WindowService) protected readonly windowService: WindowService;

    protected watchHandlesExhausted: boolean = false;

    protected get instructionsLink(): string {
        return 'https://code.visualstudio.com/docs/setup/linux#_visual-studio-code-is-unable-to-watch-for-file-changes-in-this-large-workspace-error-enospc';
    }

    public async handleError(): Promise<void> {
        if (!this.watchHandlesExhausted) {
            this.watchHandlesExhausted = true;
            if (this.isElectron()) {
                const instructionsAction = 'Instructions';
                const action = await this.messageService.warn(
                    'Unable to watch for file changes in this large workspace.  Please follow the instructions link to resolve this issue.',
                    { timeout: 60000 },
                    instructionsAction
                );
                if (action === instructionsAction) {
                    this.windowService.openNewWindow(this.instructionsLink, { external: true });
                }
            } else {
                await this.messageService.warn(
                    'Unable to watch for file changes in this large workspace.  The information you see may not include recent file changes.',
                    { timeout: 60000 }
                );
            }
        }
    }

    protected isElectron(): boolean {
        return environment.electron.is();
    }

}
