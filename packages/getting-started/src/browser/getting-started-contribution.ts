// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
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

import * as path from 'path';
import { injectable, inject } from '@theia/core/shared/inversify';
import { ArrayUtils, CommandRegistry, MenuModelRegistry, URI, UntitledResourceResolver } from '@theia/core/lib/common';
import { CommonMenus, AbstractViewContribution, FrontendApplicationContribution, FrontendApplication, PreferenceService } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { GettingStartedWidget } from './getting-started-widget';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { OpenerService, open } from '@theia/core/lib/browser/opener-service';
import { PreviewContribution } from '@theia/preview/lib/browser/preview-contribution';
import { UserWorkingDirectoryProvider } from '@theia/core/lib/browser/user-working-directory-provider';
import { WorkspaceService } from '@theia/workspace/lib/browser';

/**
 * Triggers opening the `GettingStartedWidget`.
 */
export const GettingStartedCommand = {
    id: GettingStartedWidget.ID,
    label: GettingStartedWidget.LABEL
};

@injectable()
export class GettingStartedContribution extends AbstractViewContribution<GettingStartedWidget> implements FrontendApplicationContribution {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(PreviewContribution)
    protected readonly previewContributon: PreviewContribution;

    @inject(FrontendApplicationStateService)
    protected readonly stateService: FrontendApplicationStateService;

    @inject(UntitledResourceResolver)
    protected readonly untitledResourceResolver: UntitledResourceResolver;

    @inject(UserWorkingDirectoryProvider)
    protected readonly workingDirProvider: UserWorkingDirectoryProvider;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    constructor() {
        super({
            widgetId: GettingStartedWidget.ID,
            widgetName: GettingStartedWidget.LABEL,
            defaultWidgetOptions: {
                area: 'main',
            }
        });
    }

    async onStart(app: FrontendApplication): Promise<void> {
        this.stateService.reachedState('ready').then(async () => {
            if (this.editorManager.all.length === 0) {
                const startupEditor = this.preferenceService.get('workbench.startupEditor');
                switch (startupEditor) {
                    case 'welcomePage':
                        return this.openWelcomePage();
                    case 'welcomePageInEmptyWorkbench':
                        if (!this.workspaceService.opened) {
                            return this.openWelcomePage();
                        }
                        break;
                    case 'newUntitledFile':
                        const untitledUri = this.untitledResourceResolver.createUntitledURI('', await this.workingDirProvider.getUserWorkingDir());
                        this.untitledResourceResolver.resolve(untitledUri);
                        return open(this.openerService, untitledUri);
                    case 'readme':
                        return this.openReadme();
                }
            }
        });
    }

    protected openWelcomePage(): void {
        this.preferenceService.ready.then(() => {
            const showWelcomePage: boolean = this.preferenceService.get('welcome.alwaysShowWelcomePage', true);
            if (showWelcomePage) {
                this.openView({ reveal: true, activate: true });
            }
        });
    }

    protected async openReadme(): Promise<void> {
        const readmes = await Promise.all(this.workspaceService.tryGetRoots().map(async folder => {
            const folderUri = folder.resource;
            const folderStat = await this.fileService.resolve(folderUri);
            const fileArr = folderStat?.children?.map(child => child.name).sort() || [];
            const filePath = fileArr.find(file => file.toLowerCase() === 'readme.md') || fileArr.find(file => file.toLowerCase().startsWith('readme'));
            return filePath ? path.join(folderUri.toString(), filePath) : undefined;
        }));
        const validReadmes = ArrayUtils.coalesce(readmes);
        if (validReadmes.length) {
            for (const readme of validReadmes) {
                const fileURI = new URI(readme);
                await this.previewContributon.open(fileURI);
            }
        } else {
            // If no readme is found, show the welcome page.
            this.openWelcomePage();
        }
    }

    override registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(GettingStartedCommand, {
            execute: () => this.openView({ reveal: true, activate: true }),
        });
    }

    override registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.HELP, {
            commandId: GettingStartedCommand.id,
            label: GettingStartedCommand.label,
            order: 'a10'
        });
    }
}
