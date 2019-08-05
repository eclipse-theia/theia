/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import { MessageService } from '@theia/core';
import { FrontendApplication } from '@theia/core/lib/browser';
import { ExtensionManager } from '../common';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { ExtensionWidget } from './extension-widget';

export const EXTENSIONS_WIDGET_FACTORY_ID = 'extensions';

@injectable()
export class ExtensionContribution extends AbstractViewContribution<ExtensionWidget> {

    @inject(ExtensionManager) protected readonly extensionManager: ExtensionManager;
    @inject(MessageService) protected readonly messageService: MessageService;

    constructor() {
        super({
            widgetId: EXTENSIONS_WIDGET_FACTORY_ID,
            widgetName: 'Extensions',
            defaultWidgetOptions: {
                area: 'left',
                rank: 500
            },
            toggleCommandId: 'extensionsView:toggle',
            toggleKeybinding: 'ctrlcmd+shift+x'
        });
    }

    onStart(app: FrontendApplication): void {
        this.extensionManager.onWillStartInstallation(({ reverting }) => {
            if (reverting) {
                this.messageService.error('Failed to install extensions. Reverting...');
            } else {
                this.messageService.info('Installing extensions...');
            }
        });
        this.extensionManager.onDidStopInstallation(({ reverting, failed }) => {
            if (!failed) {
                const reloadMessage = !reverting ? 'Reload to complete the installation.' : 'Reload to revert the installation.';
                this.messageService.info(reloadMessage).then(() => window.location.reload(true));
            }
        });
    }

}
