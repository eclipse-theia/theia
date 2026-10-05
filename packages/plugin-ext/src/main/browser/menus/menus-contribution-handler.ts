// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { inject, injectable, optional, named } from '@theia/core/shared/inversify';
import {
    MenuPath, CommandRegistry, Disposable, DisposableCollection, nls, CommandMenu, AcceleratorSource, ContextExpressionMatcher, environment, ILogger, Submenu, CompoundMenuNode
} from '@theia/core';
import { MenuModelRegistry, MenuNodeFactory } from '@theia/core/lib/common';
import { TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { DeployedPlugin, IconUrl, Menu } from '../../../common';
import { ScmWidget } from '@theia/scm/lib/browser/scm-widget';
import { ScmRepositoriesWidget, SCM_SOURCE_CONTROL_TITLE_MENU } from '@theia/scm/lib/browser/scm-repositories-widget';
import { ScmHistoryGraphWidget, SCM_HISTORY_TITLE_MENU } from '@theia/scm/lib/browser/scm-history-graph-widget';
import { KeybindingRegistry, QuickCommandService, codicon } from '@theia/core/lib/browser';
import {
    CodeEditorWidgetUtil, codeToTheiaMappings, ContributionPoint,
    PLUGIN_EDITOR_TITLE_MENU, PLUGIN_EDITOR_TITLE_RUN_MENU, PLUGIN_SCM_TITLE_MENU, PLUGIN_VIEW_TITLE_MENU
} from './vscode-theia-menu-mappings';
import { ArgumentAdapter, PluginMenuCommandAdapter } from './plugin-menu-command-adapter';
import { ArgumentAdaptingCompoundMenuNode } from './argument-adapting-menu-node';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { PluginSharedStyle } from '../plugin-shared-style';
import { ThemeIcon } from '@theia/monaco-editor-core/esm/vs/base/common/themables';

@injectable()
export class MenusContributionPointHandler {

    @inject(MenuModelRegistry) private readonly menuRegistry: MenuModelRegistry;
    @inject(MenuNodeFactory) protected readonly menuNodeFactory: MenuNodeFactory;
    @inject(CommandRegistry) private readonly commandRegistry: CommandRegistry;
    @inject(TabBarToolbarRegistry) private readonly tabBarToolbar: TabBarToolbarRegistry;
    @inject(PluginMenuCommandAdapter) pluginMenuCommandAdapter: PluginMenuCommandAdapter;
    @inject(ContextKeyService) protected readonly contextKeyService: ContextKeyService;
    @inject(PluginSharedStyle) protected readonly style: PluginSharedStyle;
    @inject(KeybindingRegistry) keybindingRegistry: KeybindingRegistry;

    @inject(QuickCommandService) @optional()
    private readonly quickCommandService: QuickCommandService;

    @inject(ILogger) @named('plugin-ext:MenusContributionPointHandler')
    protected readonly logger: ILogger;

    private initialized = false;
    private initialize(): void {
        this.initialized = true;
        this.tabBarToolbar.registerMenuDelegate(PLUGIN_EDITOR_TITLE_MENU, widget => CodeEditorWidgetUtil.is(widget));
        this.menuRegistry.registerSubmenu(PLUGIN_EDITOR_TITLE_RUN_MENU, 'EditorTitleRunMenu');
        this.tabBarToolbar.registerItem({
            id: this.tabBarToolbar.toElementId(PLUGIN_EDITOR_TITLE_RUN_MENU),
            menuPath: PLUGIN_EDITOR_TITLE_RUN_MENU,
            icon: codicon('debug-alt'),
            text: nls.localizeByDefault('Run or Debug...'),
            command: '',
            group: 'navigation',
            isVisible: widget => CodeEditorWidgetUtil.is(widget)
        });
        this.tabBarToolbar.registerMenuDelegate(PLUGIN_SCM_TITLE_MENU, widget => widget instanceof ScmWidget);
        this.tabBarToolbar.registerMenuDelegate(SCM_SOURCE_CONTROL_TITLE_MENU, widget => widget instanceof ScmRepositoriesWidget);
        this.tabBarToolbar.registerMenuDelegate(SCM_HISTORY_TITLE_MENU, widget => widget instanceof ScmHistoryGraphWidget);
        this.tabBarToolbar.registerMenuDelegate(PLUGIN_VIEW_TITLE_MENU, widget => !CodeEditorWidgetUtil.is(widget));
    }

    private getMatchingTheiaMenuPaths(contributionPoint: string): MenuPath[] | undefined {
        return codeToTheiaMappings.get(contributionPoint);
    }

    handle(plugin: DeployedPlugin): Disposable {
        const allMenus = plugin.contributes?.menus;
        if (!allMenus) {
            return Disposable.NULL;
        }
        if (!this.initialized) {
            this.initialize();
        }
        const toDispose = new DisposableCollection();
        const submenus = plugin.contributes?.submenus ?? [];
        for (const submenu of submenus) {
            const iconClass = submenu.icon && this.toIconClass(submenu.icon, toDispose);
            this.menuRegistry.registerSubmenu([submenu.id], submenu.label, { icon: iconClass });
        }

        for (const [contributionPoint, items] of Object.entries(allMenus)) {
            for (const item of items) {
                try {
                    if (contributionPoint === 'commandPalette') {
                        toDispose.push(this.registerCommandPaletteAction(item));
                    } else {
                        let targets = this.getMatchingTheiaMenuPaths(contributionPoint as ContributionPoint);
                        if (!targets) {
                            targets = [[contributionPoint]];
                        }
                        const { group, order } = this.parseGroup(item.group);
                        const { submenu, command } = item;
                        if (submenu && command) {
                            this.logger.warn(
                                `Menu item ${command} from plugin ${plugin.metadata.model.id} contributed both submenu and command. Only command will be registered.`
                            );
                        }
                        const argumentAdapter = this.pluginMenuCommandAdapter.getArgumentAdapter(contributionPoint);
                        if (command) {
                            const adaptArguments = argumentAdapter ?? ((...args: unknown[]) => args);
                            targets.forEach(target => {
                                const menuPath = group ? [...target, group] : target;

                                const cmd = this.commandRegistry.getCommand(command);
                                if (!cmd) {
                                    this.logger.debug(`No label for action menu node: No command "${command}" exists.`);
                                    return;
                                }
                                const label = cmd.label || cmd.id;
                                const icon = cmd.iconClass;
                                const action: CommandMenu & AcceleratorSource = {
                                    id: command,
                                    sortString: order || '',
                                    when: item.when,
                                    isVisible: <T>(contextMatcher: ContextExpressionMatcher<T>, context: T | undefined, ...args: any[]): boolean => {
                                        if (item.when && !contextMatcher.match(item.when, context)) {
                                            return false;
                                        }

                                        return this.commandRegistry.isVisible(command, ...adaptArguments(...args));
                                    },
                                    icon: icon,
                                    label: label,
                                    isEnabled: (...args: any[]): boolean =>
                                        this.commandRegistry.isEnabled(command, ...adaptArguments(...args)),
                                    run: (...args: any[]): Promise<void> =>
                                        this.commandRegistry.executeCommand(command, ...adaptArguments(...args)),
                                    isToggled: () => false,
                                    getAccelerator: (context: HTMLElement | undefined): string[] => {
                                        const bindings = this.keybindingRegistry.getKeybindingsForCommand(command);
                                        // Only consider the first active keybinding.
                                        if (bindings.length) {
                                            const binding = bindings.find(b => this.keybindingRegistry.isEnabledInScope(b, context));
                                            if (binding) {
                                                const asciiOnly = environment.electron.is();
                                                return this.keybindingRegistry.acceleratorFor(binding, '+', asciiOnly);
                                            }
                                        }
                                        return [];
                                    }
                                };
                                toDispose.push(this.menuRegistry.registerCommandMenu(menuPath, action));
                            });
                        } else if (submenu) {
                            targets.forEach(target => toDispose.push(
                                this.linkSubmenu(group ? [...target, group] : target, submenu, order, item.when, argumentAdapter)
                            ));
                        }
                    }
                } catch (error) {
                    this.logger.warn(`Failed to register a menu item for plugin ${plugin.metadata.model.id} contributed to ${contributionPoint}`, item);
                    this.logger.debug(error);
                }
            }
        }

        return toDispose;
    }

    /**
     * Links the plugin submenu into the given menu. If the contribution point the submenu is contributed to
     * requires converted arguments, the link converts the arguments for all actions reached through it.
     */
    protected linkSubmenu(newParentPath: MenuPath, submenuId: string, order: string | undefined, when: string | undefined,
        argumentAdapter: ArgumentAdapter | undefined): Disposable {
        if (!argumentAdapter) {
            return this.menuRegistry.linkCompoundMenuNode({ newParentPath, submenuPath: [submenuId], order, when });
        }
        const submenu = this.menuRegistry.getMenu([submenuId]);
        if (!submenu) {
            throw new Error(`Not a menu node: ${submenuId}`);
        }
        const link = this.menuNodeFactory.createSubmenuLink(submenu as Submenu, order, when);
        if (!CompoundMenuNode.is(link)) {
            throw new Error(`Not a compound menu node: ${link.id}`);
        }
        return this.menuRegistry.registerMenuNode(newParentPath, new ArgumentAdaptingCompoundMenuNode(link, argumentAdapter));
    }

    private parseGroup(rawGroup?: string): { group?: string, order?: string } {
        if (!rawGroup) { return {}; }
        const separatorIndex = rawGroup.lastIndexOf('@');
        if (separatorIndex > -1) {
            return { group: rawGroup.substring(0, separatorIndex), order: rawGroup.substring(separatorIndex + 1) || undefined };
        }
        return { group: rawGroup };
    }

    private registerCommandPaletteAction(menu: Menu): Disposable {
        if (menu.command && menu.when) {
            return this.quickCommandService.pushCommandContext(menu.command, menu.when);
        }
        return Disposable.NULL;
    }

    protected toIconClass(url: IconUrl, toDispose: DisposableCollection): string | undefined {
        if (typeof url === 'string') {
            const asThemeIcon = ThemeIcon.fromString(url);
            if (asThemeIcon) {
                return ThemeIcon.asClassName(asThemeIcon);
            }
        }
        const reference = this.style.toIconClass(url);
        toDispose.push(reference);
        return reference.object.iconClass;
    }
}
