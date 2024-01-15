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

import { DateTime } from 'luxon';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import debounce = require('@theia/core/shared/lodash.debounce');
import { Command, CommandRegistry } from '@theia/core/lib/common/command';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { VSXExtensionsViewContainer } from './vsx-extensions-view-container';
import { VSXExtensionsModel } from './vsx-extensions-model';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';
import { Color } from '@theia/core/lib/common/color';
import { FrontendApplication } from '@theia/core/lib/browser/frontend-application';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { MenuModelRegistry, MessageService, nls } from '@theia/core/lib/common';
import { FileDialogService, OpenFileDialogProps } from '@theia/filesystem/lib/browser';
import { LabelProvider, PreferenceService, QuickPickItem, QuickInputService, CommonMenus } from '@theia/core/lib/browser';
import { VscodeCommands } from '@theia/plugin-ext-vscode/lib/browser/plugin-vscode-commands-contribution';
import { VSXExtensionsContextMenu, VSXExtension } from './vsx-extension';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { BUILTIN_QUERY, INSTALLED_QUERY, RECOMMENDED_QUERY } from './vsx-extensions-search-model';
import { IGNORE_RECOMMENDATIONS_ID } from './recommended-extensions/recommended-extensions-preference-contribution';
import { VSXExtensionsCommands } from './vsx-extension-commands';
import { VSXExtensionRaw, OVSXApiFilter } from '@theia/ovsx-client';
import { OVSXClientProvider } from '../common/ovsx-client-provider';

export namespace VSXCommands {
    export const TOGGLE_EXTENSIONS: Command = {
        id: 'vsxExtensions.toggle',
    };
}

@injectable()
export class VSXExtensionsContribution extends AbstractViewContribution<VSXExtensionsViewContainer> implements ColorContribution, FrontendApplicationContribution {

    @inject(VSXExtensionsModel) protected model: VSXExtensionsModel;
    @inject(CommandRegistry) protected commandRegistry: CommandRegistry;
    @inject(FileDialogService) protected fileDialogService: FileDialogService;
    @inject(MessageService) protected messageService: MessageService;
    @inject(LabelProvider) protected labelProvider: LabelProvider;
    @inject(ClipboardService) protected clipboardService: ClipboardService;
    @inject(PreferenceService) protected preferenceService: PreferenceService;
    @inject(OVSXClientProvider) protected clientProvider: OVSXClientProvider;
    @inject(OVSXApiFilter) protected vsxApiFilter: OVSXApiFilter;
    @inject(QuickInputService) protected quickInput: QuickInputService;

    constructor() {
        super({
            widgetId: VSXExtensionsViewContainer.ID,
            widgetName: VSXExtensionsViewContainer.LABEL,
            defaultWidgetOptions: {
                area: 'left',
                rank: 500
            },
            toggleCommandId: VSXCommands.TOGGLE_EXTENSIONS.id,
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

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(VSXExtensionsCommands.CLEAR_ALL, {
            execute: () => this.model.search.query = '',
            isEnabled: () => !!this.model.search.query,
            isVisible: () => true,
        });

        commands.registerCommand(VSXExtensionsCommands.INSTALL_FROM_VSIX, {
            execute: () => this.installFromVSIX()
        });

        commands.registerCommand(VSXExtensionsCommands.INSTALL_ANOTHER_VERSION, {
            // Check downloadUrl to ensure we have an idea of where to look for other versions.
            isEnabled: (extension: VSXExtension) => !extension.builtin && !!extension.downloadUrl,
            execute: async (extension: VSXExtension) => this.installAnotherVersion(extension),
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

    override registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
        menus.registerMenuAction(CommonMenus.MANAGE_SETTINGS, {
            commandId: VSXCommands.TOGGLE_EXTENSIONS.id,
            label: nls.localizeByDefault('Extensions'),
            order: 'a20'
        });
        menus.registerMenuAction(VSXExtensionsContextMenu.COPY, {
            commandId: VSXExtensionsCommands.COPY.id,
            label: nls.localizeByDefault('Copy'),
            order: '0'
        });
        menus.registerMenuAction(VSXExtensionsContextMenu.COPY, {
            commandId: VSXExtensionsCommands.COPY_EXTENSION_ID.id,
            label: nls.localizeByDefault('Copy Extension ID'),
            order: '1'
        });
        menus.registerMenuAction(VSXExtensionsContextMenu.INSTALL, {
            commandId: VSXExtensionsCommands.INSTALL_ANOTHER_VERSION.id,
            label: nls.localizeByDefault('Install Another Version...'),
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
            },
            {
                id: 'extensionEditor.tableHeadBorder', defaults: {
                    dark: Color.transparent('#ffffff', 0.7),
                    light: Color.transparent('#000000', 0.7),
                    hcDark: Color.white,
                    hcLight: Color.black
                }, description: 'Border color for the table head row of the extension editor view'
            },
            {
                id: 'extensionEditor.tableCellBorder', defaults: {
                    dark: Color.transparent('#ffffff', 0.2),
                    light: Color.transparent('#000000', 0.2),
                    hcDark: Color.white,
                    hcLight: Color.black
                }, description: 'Border color for a table row of the extension editor view'
            },
            {
                id: 'extensionIcon.verifiedForeground', defaults: {
                    dark: '#40a6ff',
                    light: '#40a6ff'
                }, description: 'The icon color for extension verified publisher.'
            },
        );
    }

    /**
     * Installs a local .vsix file after prompting the `Open File` dialog. Resolves to the URI of the file.
     */
    protected async installFromVSIX(): Promise<void> {
        const props: OpenFileDialogProps = {
            title: VSXExtensionsCommands.INSTALL_FROM_VSIX.dialogLabel,
            openLabel: nls.localizeByDefault('Install from VSIX'),
            filters: { 'VSIX Extensions (*.vsix)': ['vsix'] },
            canSelectMany: false
        };
        const extensionUri = await this.fileDialogService.showOpenDialog(props);
        if (extensionUri) {
            if (extensionUri.path.ext === '.vsix') {
                const extensionName = this.labelProvider.getName(extensionUri);
                try {
                    await this.commandRegistry.executeCommand(VscodeCommands.INSTALL_FROM_VSIX.id, extensionUri);
                    this.messageService.info(nls.localizeByDefault('Completed installing {0} extension from VSIX.', extensionName));
                } catch (e) {
                    this.messageService.error(nls.localize('theia/vsx-registry/failedInstallingVSIX', 'Failed to install {0} from VSIX.', extensionName));
                    console.warn(e);
                }
            } else {
                this.messageService.error(nls.localize('theia/vsx-registry/invalidVSIX', 'The selected file is not a valid "*.vsix" plugin.'));
            }
        }
    }

    /**
     * Given an extension, displays a quick pick of other compatible versions and installs the selected version.
     *
     * @param extension a VSX extension.
     */
    protected async installAnotherVersion(extension: VSXExtension): Promise<void> {
        const extensionId = extension.id;
        const currentVersion = extension.version;
        const client = await this.clientProvider();
        const { extensions } = await client.query({ extensionId, includeAllVersions: true });
        const latestCompatible = this.vsxApiFilter.getLatestCompatibleExtension(extensions);
        let compatibleExtensions: VSXExtensionRaw[] = [];
        let activeItem = undefined;
        if (latestCompatible) {
            compatibleExtensions = extensions.slice(extensions.findIndex(ext => ext.version === latestCompatible.version));
        }
        const items: QuickPickItem[] = compatibleExtensions.map(ext => {
            const item = {
                label: ext.version,
                description: DateTime.fromISO(ext.timestamp).toRelative({ locale: nls.locale }) ?? ''
            };
            if (currentVersion === ext.version) {
                item.description += ` (${nls.localizeByDefault('Current')})`;
                activeItem = item;
            }
            return item;
        });
        const selectedItem = await this.quickInput.showQuickPick(items, {
            placeholder: nls.localizeByDefault('Select Version to Install'),
            runIfSingle: false,
            activeItem
        });
        if (selectedItem) {
            const selectedExtension = this.model.getExtension(extensionId);
            if (selectedExtension) {
                await this.updateVersion(selectedExtension, selectedItem.label);
            }
        }
    }

    protected async copy(extension: VSXExtension): Promise<void> {
        this.clipboardService.writeText(await extension.serialize());
    }

    protected copyExtensionId(extension: VSXExtension): void {
        this.clipboardService.writeText(extension.id);
    }

    /**
     * Updates an extension to a specific version.
     *
     * @param extension the extension to update.
     * @param updateToVersion the version to update to.
     * @param revertToVersion the version to revert to (in case of failure).
     */
    protected async updateVersion(extension: VSXExtension, updateToVersion: string): Promise<void> {
        try {
            await extension.install({ version: updateToVersion, ignoreOtherVersions: true });
        } catch {
            this.messageService.warn(nls.localize('theia/vsx-registry/vsx-extensions-contribution/update-version-version-error', 'Failed to install version {0} of {1}.',
                updateToVersion, extension.displayName));
            return;
        }
        try {
            if (extension.version !== updateToVersion) {
                await extension.uninstall();
            }
        } catch {
            this.messageService.warn(nls.localize('theia/vsx-registry/vsx-extensions-contribution/update-version-uninstall-error', 'Error while removing the extension: {0}.',
                extension.displayName));
        }
    }

    protected async showRecommendedToast(): Promise<void> {
        if (!this.preferenceService.get(IGNORE_RECOMMENDATIONS_ID, false)) {
            const recommended = new Set([...this.model.recommended]);
            for (const installed of this.model.installed) {
                recommended.delete(installed);
            }
            if (recommended.size) {
                const install = nls.localizeByDefault('Install');
                const showRecommendations = nls.localizeByDefault('Show Recommendations');
                const userResponse = await this.messageService.info(
                    nls.localize('theia/vsx-registry/recommendedExtensions', 'Do you want to install the recommended extensions for this repository?'),
                    install,
                    showRecommendations
                );
                if (userResponse === install) {
                    for (const recommendation of recommended) {
                        this.model.getExtension(recommendation)?.install();
                    }
                } else if (userResponse === showRecommendations) {
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
