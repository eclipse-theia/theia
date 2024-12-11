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

import { inject, injectable, optional } from '@theia/core/shared/inversify';
import { MenuPath, CommandRegistry, Disposable, DisposableCollection, ActionMenuNode, MenuCommandAdapterRegistry, Emitter, nls } from '@theia/core';
import { MenuModelRegistry } from '@theia/core/lib/common';
import { TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { DeployedPlugin, IconUrl, Menu } from '../../../common';
import { ScmWidget } from '@theia/scm/lib/browser/scm-widget';
import { QuickCommandService } from '@theia/core/lib/browser';
import {
    CodeEditorWidgetUtil, codeToTheiaMappings, ContributionPoint,
    PLUGIN_EDITOR_TITLE_MENU, PLUGIN_EDITOR_TITLE_RUN_MENU, PLUGIN_SCM_TITLE_MENU, PLUGIN_VIEW_TITLE_MENU
} from './vscode-theia-menu-mappings';
import { PluginMenuCommandAdapter, ReferenceCountingSet } from './plugin-menu-command-adapter';
import { ContextKeyExpr } from '@theia/monaco-editor-core/esm/vs/platform/contextkey/common/contextkey';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { PluginSharedStyle } from '../plugin-shared-style';
import { ThemeIcon } from '@theia/monaco-editor-core/esm/vs/base/common/themables';

@injectable()
export class MenusContributionPointHandler {

    @inject(MenuModelRegistry) private readonly menuRegistry: MenuModelRegistry;
    @inject(CommandRegistry) private readonly commands: CommandRegistry;
    @inject(TabBarToolbarRegistry) private readonly tabBarToolbar: TabBarToolbarRegistry;
    @inject(CodeEditorWidgetUtil) private readonly codeEditorWidgetUtil: CodeEditorWidgetUtil;
    @inject(PluginMenuCommandAdapter) protected readonly commandAdapter: PluginMenuCommandAdapter;
    @inject(MenuCommandAdapterRegistry) protected readonly commandAdapterRegistry: MenuCommandAdapterRegistry;
    @inject(ContextKeyService) protected readonly contextKeyService: ContextKeyService;
    @inject(PluginSharedStyle) protected readonly style: PluginSharedStyle;
    @inject(QuickCommandService) @optional()
    private readonly quickCommandService: QuickCommandService;

    protected readonly titleContributionContextKeys = new ReferenceCountingSet();
    protected readonly onDidChangeTitleContributionEmitter = new Emitter<void>();

    private initialized = false;
    private initialize(): void {
        this.initialized = true;
        this.commandAdapterRegistry.registerAdapter(this.commandAdapter);
        this.tabBarToolbar.registerMenuDelegate(PLUGIN_EDITOR_TITLE_MENU, widget => this.codeEditorWidgetUtil.is(widget));
        this.tabBarToolbar.registerItem({
            id: this.tabBarToolbar.toElementId(PLUGIN_EDITOR_TITLE_RUN_MENU), menuPath: PLUGIN_EDITOR_TITLE_RUN_MENU,
            icon: 'debug-alt', text: nls.localizeByDefault('Run or Debug...'),
            command: '', group: 'navigation', isVisible: widget => this.codeEditorWidgetUtil.is(widget)
        });
        this.tabBarToolbar.registerMenuDelegate(PLUGIN_SCM_TITLE_MENU, widget => widget instanceof ScmWidget);
        this.tabBarToolbar.registerMenuDelegate(PLUGIN_VIEW_TITLE_MENU, widget => !this.codeEditorWidgetUtil.is(widget));
        this.tabBarToolbar.registerItem({ id: 'plugin-menu-contribution-title-contribution', command: '_never_', onDidChange: this.onDidChangeTitleContributionEmitter.event });
        this.contextKeyService.onDidChange(event => {
            if (event.affects(this.titleContributionContextKeys)) {
                this.onDidChangeTitleContributionEmitter.fire();
            }
        });
    }

    private getMatchingMenu(contributionPoint: ContributionPoint): MenuPath[] | undefined {
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
            this.menuRegistry.registerIndependentSubmenu(submenu.id, submenu.label, iconClass ? { iconClass } : undefined);
        }

        for (const [contributionPoint, items] of Object.entries(allMenus)) {
            for (const item of items) {
                try {
                    if (contributionPoint === 'commandPalette') {
                        toDispose.push(this.registerCommandPaletteAction(item));
                    } else {
                        this.checkTitleContribution(contributionPoint, item, toDispose);
                        const targets = this.getMatchingMenu(contributionPoint as ContributionPoint) ?? [contributionPoint];
                        const { group, order } = this.parseGroup(item.group);
                        const { submenu, command } = item;
                        if (submenu && command) {
                            console.warn(
                                `Menu item ${command} from plugin ${plugin.metadata.model.id} contributed both submenu and command. Only command will be registered.`
                            );
                        }
                        if (command) {
                            toDispose.push(this.commandAdapter.addCommand(command));
                            targets.forEach(target => {

                                const node = new ActionMenuNode({
                                    commandId: command,
                                    when: item.when,
                                    order
                                }, this.commands);
                                const parent = this.menuRegistry.getMenuNode(target, group);
                                toDispose.push(parent.addNode(node));
                            });
                        } else if (submenu) {
                            targets.forEach(target => toDispose.push(this.menuRegistry.linkSubmenu(target, submenu!, { order, when: item.when }, group)));
                        }
                    }
                } catch (error) {
                    console.warn(`Failed to register a menu item for plugin ${plugin.metadata.model.id} contributed to ${contributionPoint}`, item, error);
                }
            }
        }

        return toDispose;
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

    protected checkTitleContribution(contributionPoint: ContributionPoint | string, contribution: { when?: string }, toDispose: DisposableCollection): void {
        if (contribution.when && contributionPoint.endsWith('title')) {
            const expression = ContextKeyExpr.deserialize(contribution.when);
            if (expression) {
                for (const key of expression.keys()) {
                    this.titleContributionContextKeys.add(key);
                    toDispose.push(Disposable.create(() => this.titleContributionContextKeys.delete(key)));
                }
                toDispose.push(Disposable.create(() => this.onDidChangeTitleContributionEmitter.fire()));
            }
        }
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
