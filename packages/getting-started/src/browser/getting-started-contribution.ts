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

import { injectable, inject } from '@theia/core/shared/inversify';
import {
    ArrayUtils, CommandRegistry, MenuModelRegistry, nls, PreferenceContribution,
    PreferenceDataProperty, PreferenceSchemaService, PreferenceService
} from '@theia/core/lib/common';
import { CommonCommands, CommonMenus, AbstractViewContribution, FrontendApplicationContribution, FrontendApplication } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { GettingStartedWidget } from './getting-started-widget';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { PreviewContribution } from '@theia/preview/lib/browser/preview-contribution';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';
import { Color } from '@theia/core/lib/common/color';
import { WalkthroughService } from './walkthrough-service';

/**
 * Triggers opening the `GettingStartedWidget`.
 */
export const GettingStartedCommand = {
    id: GettingStartedWidget.ID,
    label: GettingStartedWidget.LABEL
};

// WalkthroughCommands imported from common and re-exported for backward compatibility
import { WalkthroughCommands } from '../common/walkthrough-commands';
export { WalkthroughCommands };

@injectable()
export class GettingStartedContribution extends AbstractViewContribution<GettingStartedWidget>
    implements FrontendApplicationContribution, PreferenceContribution, ColorContribution {

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(PreviewContribution)
    protected readonly previewContribution: PreviewContribution;

    @inject(FrontendApplicationStateService)
    protected readonly stateService: FrontendApplicationStateService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(WalkthroughService)
    protected readonly walkthroughService: WalkthroughService;

    constructor() {
        super({
            widgetId: GettingStartedWidget.ID,
            widgetName: GettingStartedWidget.LABEL,
            defaultWidgetOptions: {
                area: 'main',
            }
        });
    }

    async initSchema(service: PreferenceSchemaService): Promise<void> {
        const property: PreferenceDataProperty = {
            enumDescriptions: [
                nls.localizeByDefault('Start without an editor.'),
                nls.localize('theia/getting-started/startup-editor/welcomePage', 'Open the Welcome page, with content to aid in getting started with {0} and extensions.',
                    FrontendApplicationConfigProvider.get().applicationName),
                // eslint-disable-next-line max-len
                nls.localizeByDefault("Open the README when opening a folder that contains one, fallback to 'welcomePage' otherwise. Note: This is only observed as a global configuration, it will be ignored if set in a workspace or folder configuration."),
                nls.localizeByDefault('Open a new untitled text file (only applies when opening an empty window).'),
                nls.localizeByDefault('Open the Welcome page when opening an empty workbench.'),
            ],
        };
        service.updateSchemaProperty('workbench.startupEditor', property);
    }

    async onStart(app: FrontendApplication): Promise<void> {
        this.stateService.reachedState('ready').then(async () => {
            if (this.editorManager.all.length === 0) {
                await this.preferenceService.ready;
                const startupEditor = this.preferenceService.get('workbench.startupEditor');
                switch (startupEditor) {
                    case 'welcomePage':
                        this.openView({ reveal: true, activate: true });
                        break;
                    case 'welcomePageInEmptyWorkbench':
                        if (!this.workspaceService.opened) {
                            this.openView({ reveal: true, activate: true });
                        }
                        break;
                    case 'newUntitledFile':
                        this.commandRegistry.executeCommand(CommonCommands.NEW_UNTITLED_TEXT_FILE.id);
                        break;
                    case 'readme':
                        await this.openReadme();
                        break;
                }
            }
        });
    }

    protected async openReadme(): Promise<void> {
        const roots = await this.workspaceService.roots;
        const readmes = await Promise.all(roots.map(async folder => {
            const folderStat = await this.fileService.resolve(folder.resource);
            const fileArr = folderStat?.children?.sort((a, b) => a.name.localeCompare(b.name)) || [];
            const filePath = fileArr.find(file => file.name.toLowerCase() === 'readme.md') || fileArr.find(file => file.name.toLowerCase().startsWith('readme'));
            return filePath?.resource;
        }));
        const validReadmes = ArrayUtils.coalesce(readmes);
        if (validReadmes.length) {
            for (const readme of validReadmes) {
                await this.previewContribution.open(readme);
            }
        } else {
            // If no readme is found, show the welcome page.
            this.openView({ reveal: true, activate: true });
        }
    }

    override registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(GettingStartedCommand, {
            execute: () => this.openView({ reveal: true, activate: true }),
        });
        registry.registerCommand(WalkthroughCommands.OPEN_WALKTHROUGH, {
            execute: async (walkthroughId?: string) => {
                await this.openView({ reveal: true, activate: true });
                if (walkthroughId) {
                    this.walkthroughService.selectWalkthrough(walkthroughId);
                }
            }
        });
        registry.registerCommand(WalkthroughCommands.RESET_WALKTHROUGH_PROGRESS, {
            execute: async (walkthroughId?: string) => {
                if (walkthroughId) {
                    await this.walkthroughService.resetProgress(walkthroughId);
                }
            }
        });
    }

    override registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.HELP, {
            commandId: GettingStartedCommand.id,
            label: GettingStartedCommand.label,
            order: 'a10'
        });
    }

    registerColors(colors: ColorRegistry): void {
        colors.register(
            {
                id: 'walkthrough.stepTitle.foreground',
                defaults: { dark: '#FFFFFF', light: '#000000', hcDark: '#FFFFFF', hcLight: '#000000' },
                description: 'Foreground color of walkthrough step titles.'
            },
            {
                id: 'walkthrough.progress.foreground',
                defaults: {
                    dark: Color.transparent('foreground', 0.7),
                    light: Color.transparent('foreground', 0.7),
                    hcDark: 'foreground',
                    hcLight: 'foreground'
                },
                description: 'Foreground color for walkthrough progress indicators.'
            }
        );
    }
}
