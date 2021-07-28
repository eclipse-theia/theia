/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import debounce = require('@theia/core/shared/lodash.debounce');
import { CommandRegistry } from '@theia/core/lib/common/command';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { VSXExtensionsViewContainer } from './vsx-extensions-view-container';
import { VSXExtensionsModel } from './vsx-extensions-model';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { ColorRegistry, Color } from '@theia/core/lib/browser/color-registry';
import { FrontendApplicationContribution, FrontendApplication } from '@theia/core/lib/browser/frontend-application';
import { MenuModelRegistry, MessageService } from '@theia/core/lib/common';
import { FileDialogService, OpenFileDialogProps } from '@theia/filesystem/lib/browser';
import { LabelProvider, PreferenceService } from '@theia/core/lib/browser';
import { VscodeCommands } from '@theia/plugin-ext-vscode/lib/browser/plugin-vscode-commands-contribution';
import { VSXExtensionsContextMenu, VSXExtension } from './vsx-extension';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { BUILTIN_QUERY, INSTALLED_QUERY, RECOMMENDED_QUERY } from './vsx-extensions-search-model';
import { IGNORE_RECOMMENDATIONS_ID } from './recommended-extensions/recommended-extensions-preference-contribution';
import { VSXExtensionsCommands } from './vsx-extension-commands';

/**
 * @deprecated since 1.17.0. - Moved to `vsx-extension-commands.ts` to avoid circular dependencies. Import from there, instead.
 */
export { VSXExtensionsCommands };

@injectable()
export class VSXExtensionsContribution extends AbstractViewContribution<VSXExtensionsViewContainer>
    implements ColorContribution, FrontendApplicationContribution {

    @inject(VSXExtensionsModel) protected readonly model: VSXExtensionsModel;
    @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry;
    @inject(FileDialogService) protected readonly fileDialogService: FileDialogService;
    @inject(MessageService) protected readonly messageService: MessageService;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(ClipboardService) protected readonly clipboardService: ClipboardService;
    @inject(PreferenceService) protected readonly preferenceService: PreferenceService;

    constructor() {
        super({
            widgetId: VSXExtensionsViewContainer.ID,
            widgetName: VSXExtensionsViewContainer.LABEL,
            defaultWidgetOptions: {
                area: 'left',
                rank: 500
            },
            toggleCommandId: 'vsxExtensions.toggle',
            toggleKeybinding: 'ctrlcmd+shift+x'
        });
    }

    @postConstruct()
    protected init(): void {
        const oneShotDisposable = this.model.onDidChange(debounce(() => {
            this.showRecommendedToast();
            oneShotDisposable.dispose();
        }, 5000, { trailing: true }));
    }

    async initializeLayout(app: FrontendApplication): Promise<void> {
        await this.openView({ activate: false });
    }

    registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(VSXExtensionsCommands.CLEAR_ALL, {
            execute: () => this.model.search.query = '',
            isEnabled: () => !!this.model.search.query,
            isVisible: () => true,
        });

        commands.registerCommand(VSXExtensionsCommands.INSTALL_FROM_VSIX, {
            execute: () => this.installFromVSIX()
        });

        commands.registerCommand(VSXExtensionsCommands.COPY, {
            execute: (extension: VSXExtension) => this.copy(extension)
        });

        commands.registerCommand(VSXExtensionsCommands.COPY_EXTENSION_ID, {
            execute: (extension: VSXExtension) => this.copyExtensionId(extension)
        });

        commands.registerCommand(VSXExtensionsCommands.SHOW_BUILTINS, {
            execute: () => this.showBuiltinExtensions()
        });

        commands.registerCommand(VSXExtensionsCommands.SHOW_INSTALLED, {
            execute: () => this.showInstalledExtensions()
        });

        commands.registerCommand(VSXExtensionsCommands.SHOW_RECOMMENDATIONS, {
            execute: () => this.showRecommendedExtensions()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
        menus.registerMenuAction(VSXExtensionsContextMenu.COPY, {
            commandId: VSXExtensionsCommands.COPY.id,
            label: 'Copy',
            order: '0'
        });
        menus.registerMenuAction(VSXExtensionsContextMenu.COPY, {
            commandId: VSXExtensionsCommands.COPY_EXTENSION_ID.id,
            label: 'Copy Extension Id',
            order: '1'
        });
    }

    registerColors(colors: ColorRegistry): void {
        // VS Code colors should be aligned with https://code.visualstudio.com/api/references/theme-color#extensions
        colors.register(
            {
                id: 'extensionButton.prominentBackground', defaults: {
                    dark: '#327e36',
                    light: '#327e36'
                }, description: 'Button background color for actions extension that stand out (e.g. install button).'
            },
            {
                id: 'extensionButton.prominentForeground', defaults: {
                    dark: Color.white,
                    light: Color.white
                }, description: 'Button foreground color for actions extension that stand out (e.g. install button).'
            },
            {
                id: 'extensionButton.prominentHoverBackground', defaults: {
                    dark: '#28632b',
                    light: '#28632b'
                }, description: 'Button background hover color for actions extension that stand out (e.g. install button).'
            }
        );
    }

    /**
     * Installs a local .vsix file after prompting the `Open File` dialog. Resolves to the URI of the file.
     */
    protected async installFromVSIX(): Promise<void> {
        const props: OpenFileDialogProps = {
            title: VSXExtensionsCommands.INSTALL_FROM_VSIX.dialogLabel,
            openLabel: 'Install',
            filters: { 'VSIX Extensions (*.vsix)': ['vsix'] },
            canSelectMany: false
        };
        const extensionUri = await this.fileDialogService.showOpenDialog(props);
        if (extensionUri) {
            if (extensionUri.path.ext === '.vsix') {
                const extensionName = this.labelProvider.getName(extensionUri);
                try {
                    await this.commandRegistry.executeCommand(VscodeCommands.INSTALL_FROM_VSIX.id, extensionUri);
                    this.messageService.info(`Completed installing ${extensionName} from VSIX.`);
                } catch (e) {
                    this.messageService.error(`Failed to install ${extensionName} from VSIX.`);
                    console.warn(e);
                }
            } else {
                this.messageService.error('The selected file is not a valid "*.vsix" plugin.');
            }
        }
    }

    protected async copy(extension: VSXExtension): Promise<void> {
        this.clipboardService.writeText(await extension.serialize());
    }

    protected copyExtensionId(extension: VSXExtension): void {
        this.clipboardService.writeText(extension.id);
    }

    protected async showRecommendedToast(): Promise<void> {
        if (!this.preferenceService.get(IGNORE_RECOMMENDATIONS_ID, false)) {
            const recommended = new Set([...this.model.recommended]);
            for (const installed of this.model.installed) {
                recommended.delete(installed);
            }
            if (recommended.size) {
                const userResponse = await this.messageService.info('Would you like to install the recommended extensions?', 'Install', 'Show Recommended');
                if (userResponse === 'Install') {
                    for (const recommendation of recommended) {
                        this.model.getExtension(recommendation)?.install();
                    }
                } else if (userResponse === 'Show Recommended') {
                    await this.showRecommendedExtensions();
                }
            }
        }
    }

    protected async showBuiltinExtensions(): Promise<void> {
        await this.openView({ activate: true });
        this.model.search.query = BUILTIN_QUERY;
    }

    protected async showInstalledExtensions(): Promise<void> {
        await this.openView({ activate: true });
        this.model.search.query = INSTALLED_QUERY;
    }

    protected async showRecommendedExtensions(): Promise<void> {
        await this.openView({ activate: true });
        this.model.search.query = RECOMMENDED_QUERY;
    }
}
