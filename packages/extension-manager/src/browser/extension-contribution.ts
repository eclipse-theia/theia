/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { MessageService } from "@theia/core";
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
                rank: 300
            },
            toggleCommandId: 'extensionsView:toggle',
            toggleKeybinding: 'ctrlcmd+shift+x'
        });
    }

    onStart(app: FrontendApplication) {
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
