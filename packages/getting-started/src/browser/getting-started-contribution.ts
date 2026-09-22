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
    ArrayUtils, CommandRegistry, MenuModelRegistry, MessageService, nls, PreferenceContribution,
    PreferenceDataProperty, PreferenceSchemaService, PreferenceService, QuickInputService, QuickPickItem
} from '@theia/core/lib/common';
import { CommonCommands, CommonMenus, AbstractViewContribution, FrontendApplicationContribution, FrontendApplication } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { GettingStartedWidget } from './getting-started-widget';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { URI as VSCodeURI } from '@theia/core/shared/vscode-uri';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';
import { Color } from '@theia/core/lib/common/color';
import { WalkthroughService } from './walkthrough-service';
import { WalkthroughCommands } from '../common/walkthrough-commands';

/**
 * Triggers opening the `GettingStartedWidget`.
 */
export const GettingStartedCommand = {
    id: GettingStartedWidget.ID,
    label: GettingStartedWidget.LABEL
};

/**
 * How a walkthrough can be referenced when opening it through a command.
 * The object form is what VS Code's `workbench.action.openWalkthrough` accepts, e.g. from a `command:` link
 * in a step description.
 */
export type WalkthroughReference = string | { category?: string; step?: string };

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

    @inject(FrontendApplicationStateService)
    protected readonly stateService: FrontendApplicationStateService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(WalkthroughService)
    protected readonly walkthroughService: WalkthroughService;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

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
                // Convert to a vscode.Uri so the markdown extension receives the URI shape it expects on the plugin host.
                await this.commandRegistry.executeCommand('markdown.showPreview', VSCodeURI.parse(readme.toString()));
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
            execute: (walkthrough?: WalkthroughReference) => this.openWalkthrough(walkthrough)
        });
        registry.registerCommand(WalkthroughCommands.OPEN_WALKTHROUGH_VSCODE, {
            execute: (walkthrough?: WalkthroughReference) => this.openWalkthrough(walkthrough)
        });
        registry.registerAlias(WalkthroughCommands.OPEN_WALKTHROUGH_VSCODE.id, WalkthroughCommands.OPEN_WALKTHROUGH.id);
        registry.registerCommand(WalkthroughCommands.RESET_WALKTHROUGH_PROGRESS, {
            execute: async (walkthroughId?: string) => {
                const id = walkthroughId ?? await this.pickWalkthrough();
                if (id) {
                    await this.walkthroughService.resetProgress(id);
                }
            }
        });
    }

    /**
     * Open the welcome view and, if a walkthrough is given, select it.
     * Accepts both a plain id and the argument object that VS Code's `workbench.action.openWalkthrough` uses.
     * Without a walkthrough, the available ones are offered for selection.
     */
    protected async openWalkthrough(walkthrough?: WalkthroughReference): Promise<void> {
        const requestedId = typeof walkthrough === 'string' ? walkthrough : walkthrough?.category;
        const walkthroughId = requestedId ?? await this.pickWalkthrough();
        if (!walkthroughId) {
            return;
        }
        // The selection is applied before the view opens so that its first render already shows the
        // walkthrough, instead of briefly showing the regular welcome content.
        this.walkthroughService.selectWalkthrough(walkthroughId);
        const stepId = typeof walkthrough === 'string' ? undefined : walkthrough?.step;
        if (stepId) {
            // VS Code qualifies step ids with the walkthrough they belong to.
            this.walkthroughService.selectStep(stepId.substring(stepId.lastIndexOf('#') + 1));
        }
        await this.openView({ reveal: true, activate: true });
    }

    /**
     * Let the user choose one of the available walkthroughs, completed ones included.
     *
     * @returns the id of the chosen walkthrough, or `undefined` if there is nothing to choose or the user cancelled.
     */
    protected async pickWalkthrough(): Promise<string | undefined> {
        const walkthroughs = this.walkthroughService.getWalkthroughs();
        if (walkthroughs.length === 0) {
            this.messageService.info(nls.localize('theia/getting-started/noWalkthroughs', 'No walkthroughs are available.'));
            return undefined;
        }
        const items: QuickPickItem[] = walkthroughs.map(walkthrough => {
            const { completed, total } = this.walkthroughService.getStepProgress(walkthrough.id);
            return {
                id: walkthrough.id,
                label: walkthrough.title,
                description: completed === total
                    ? nls.localizeByDefault('Completed')
                    : nls.localizeByDefault('{0} of {1}', String(completed), String(total)),
                detail: walkthrough.description
            };
        });
        const picked = await this.quickInputService.showQuickPick(items, {
            placeholder: nls.localizeByDefault('Select a walkthrough to open')
        });
        return picked?.id;
    }

    override registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.HELP, {
            commandId: GettingStartedCommand.id,
            label: GettingStartedCommand.label,
            order: 'a10'
        });
        menus.registerMenuAction(CommonMenus.HELP, {
            commandId: WalkthroughCommands.OPEN_WALKTHROUGH.id,
            label: WalkthroughCommands.OPEN_WALKTHROUGH.label,
            order: 'a20'
        });
    }

    registerColors(colors: ColorRegistry): void {
        colors.register(
            {
                id: 'walkthrough.stepTitle.foreground',
                defaults: { dark: 'foreground', light: 'foreground', hcDark: 'foreground', hcLight: 'foreground' },
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
            },
            {
                id: 'walkthrough.card.background',
                defaults: {
                    // A foreground tint stays subtle and lightens on dark themes instead of darkening them.
                    dark: Color.transparent('foreground', 0.04),
                    light: Color.transparent('foreground', 0.04)
                },
                description: 'Background color of the walkthrough cards on the Welcome page.'
            },
            {
                id: 'walkthrough.progress.background',
                defaults: {
                    dark: Color.transparent('foreground', 0.2),
                    light: Color.transparent('foreground', 0.2),
                    hcDark: 'contrastBorder',
                    hcLight: 'contrastBorder'
                },
                description: 'Background color of the walkthrough progress bar.'
            },
            {
                id: 'walkthrough.stepCompleted.foreground',
                defaults: {
                    dark: 'successBackground',
                    light: 'successBackground',
                    hcDark: 'successBackground',
                    hcLight: 'successBackground'
                },
                description: 'Foreground color of the indicator marking a walkthrough step as completed.'
            }
        );
    }
}
