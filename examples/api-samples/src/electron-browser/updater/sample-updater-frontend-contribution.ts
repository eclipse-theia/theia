// *****************************************************************************
// Copyright (C) 2020 TypeFox and others.
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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { CommonMenus } from '@theia/core/lib/browser';
import {
    Emitter,
    Command,
    MenuPath,
    MessageService,
    MenuModelRegistry,
    MenuContribution,
    CommandRegistry,
    CommandContribution
} from '@theia/core/lib/common';
import { ElectronMainMenuFactory } from '@theia/core/lib/electron-browser/menu/electron-main-menu-factory';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { SampleUpdater, UpdateStatus, SampleUpdaterClient } from '../../common/updater/sample-updater';

export namespace SampleUpdaterCommands {

    const category = 'API Samples';

    export const CHECK_FOR_UPDATES: Command = {
        id: 'electron-sample:check-for-updates',
        label: 'Check for Updates...',
        category
    };

    export const RESTART_TO_UPDATE: Command = {
        id: 'electron-sample:restart-to-update',
        label: 'Restart to Update',
        category
    };

    // Mock
    export const MOCK_UPDATE_AVAILABLE: Command = {
        id: 'electron-sample:mock-update-available',
        label: 'Mock Update - Available',
        category
    };

    export const MOCK_UPDATE_NOT_AVAILABLE: Command = {
        id: 'electron-sample:mock-update-not-available',
        label: 'Mock Update - Not Available',
        category
    };

}

export namespace SampleUpdaterMenu {
    export const MENU_PATH: MenuPath = [...CommonMenus.FILE_SETTINGS_SUBMENU, '3_settings_submenu_update'];
}

@injectable()
export class SampleUpdaterClientImpl implements SampleUpdaterClient {

    protected readonly onReadyToInstallEmitter = new Emitter<void>();
    readonly onReadyToInstall = this.onReadyToInstallEmitter.event;

    notifyReadyToInstall(): void {
        this.onReadyToInstallEmitter.fire();
    }

}

// Dynamic menus aren't yet supported by electron: https://github.com/eclipse-theia/theia/issues/446
@injectable()
export class ElectronMenuUpdater {

    @inject(ElectronMainMenuFactory)
    protected readonly factory: ElectronMainMenuFactory;

    public update(): void {
        this.setMenu();
    }

    private setMenu(): void {
        window.electronTheiaCore.setMenu(this.factory.createElectronMenuBar());
    }

}

@injectable()
export class SampleUpdaterFrontendContribution implements CommandContribution, MenuContribution {

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(ElectronMenuUpdater)
    protected readonly menuUpdater: ElectronMenuUpdater;

    @inject(SampleUpdater)
    protected readonly updater: SampleUpdater;

    @inject(SampleUpdaterClientImpl)
    protected readonly updaterClient: SampleUpdaterClientImpl;

    protected readyToUpdate = false;

    @postConstruct()
    protected init(): void {
        this.updaterClient.onReadyToInstall(async () => {
            this.readyToUpdate = true;
            this.menuUpdater.update();
            this.handleUpdatesAvailable();
        });
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(SampleUpdaterCommands.CHECK_FOR_UPDATES, {
            execute: async () => {
                const { status } = await this.updater.checkForUpdates();
                switch (status) {
                    case UpdateStatus.Available: {
                        this.handleUpdatesAvailable();
                        break;
                    }
                    case UpdateStatus.NotAvailable: {
                        const { applicationName } = FrontendApplicationConfigProvider.get();
                        this.messageService.info(`[Sample Updater - Not Available]: You're all good. You've got the latest version of ${applicationName}.`, { timeout: 3000 });
                        break;
                    }
                    case UpdateStatus.InProgress: {
                        this.messageService.warn('[Sample Updater - Downloading]: Work in progress...', { timeout: 3000 });
                        break;
                    }
                    default: throw new Error(`Unexpected status: ${status}`);
                }
            },
            isEnabled: () => !this.readyToUpdate,
            isVisible: () => !this.readyToUpdate
        });
        registry.registerCommand(SampleUpdaterCommands.RESTART_TO_UPDATE, {
            execute: () => this.updater.onRestartToUpdateRequested(),
            isEnabled: () => this.readyToUpdate,
            isVisible: () => this.readyToUpdate
        });
        registry.registerCommand(SampleUpdaterCommands.MOCK_UPDATE_AVAILABLE, {
            execute: () => this.updater.setUpdateAvailable(true)
        });
        registry.registerCommand(SampleUpdaterCommands.MOCK_UPDATE_NOT_AVAILABLE, {
            execute: () => this.updater.setUpdateAvailable(false)
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerMenuAction(SampleUpdaterMenu.MENU_PATH, {
            commandId: SampleUpdaterCommands.CHECK_FOR_UPDATES.id
        });
        registry.registerMenuAction(SampleUpdaterMenu.MENU_PATH, {
            commandId: SampleUpdaterCommands.RESTART_TO_UPDATE.id
        });
    }

    protected async handleUpdatesAvailable(): Promise<void> {
        const answer = await this.messageService.info('[Sample Updater - Available]: Found updates, do you want update now?', 'No', 'Yes');
        if (answer === 'Yes') {
            this.updater.onRestartToUpdateRequested();
        }
    }

}
