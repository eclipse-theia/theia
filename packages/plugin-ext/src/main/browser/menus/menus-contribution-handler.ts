/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { URI as CodeUri } from '@theia/core/shared/vscode-uri';
import { injectable, inject, optional } from '@theia/core/shared/inversify';
import { MenuPath, ILogger, CommandRegistry, Command, Mutable, MenuAction, SelectionService, CommandHandler, Disposable, DisposableCollection } from '@theia/core';
import { EDITOR_CONTEXT_MENU, EditorWidget } from '@theia/editor/lib/browser';
import { MenuModelRegistry } from '@theia/core/lib/common';
import { Emitter } from '@theia/core/lib/common/event';
import { TabBarToolbarRegistry, TabBarToolbarItem } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { NAVIGATOR_CONTEXT_MENU } from '@theia/navigator/lib/browser/navigator-contribution';
import { VIEW_ITEM_CONTEXT_MENU, TreeViewWidget, VIEW_ITEM_INLINE_MENU } from '../view/tree-view-widget';
import { DeployedPlugin, Menu, ScmCommandArg, TimelineCommandArg, TreeViewSelection } from '../../../common';
import { DebugStackFramesWidget } from '@theia/debug/lib/browser/view/debug-stack-frames-widget';
import { DebugThreadsWidget } from '@theia/debug/lib/browser/view/debug-threads-widget';
import { TreeWidgetSelection } from '@theia/core/lib/browser/tree/tree-widget-selection';
import { ScmWidget } from '@theia/scm/lib/browser/scm-widget';
import { ScmTreeWidget } from '@theia/scm/lib/browser/scm-tree-widget';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { ScmRepository } from '@theia/scm/lib/browser/scm-repository';
import { PluginScmProvider, PluginScmResourceGroup, PluginScmResource } from '../scm-main';
import { ResourceContextKey } from '@theia/core/lib/browser/resource-context-key';
import { PluginViewWidget } from '../view/plugin-view-widget';
import { ViewContextKeyService } from '../view/view-context-key-service';
import { WebviewWidget } from '../webview/webview';
import { Navigatable } from '@theia/core/lib/browser/navigatable';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { TIMELINE_ITEM_CONTEXT_MENU } from '@theia/timeline/lib/browser/timeline-tree-widget';
import { TimelineItem } from '@theia/timeline/lib/common/timeline-model';
import { COMMENT_CONTEXT, COMMENT_THREAD_CONTEXT, COMMENT_TITLE } from '../comments/comment-thread-widget';
import { QuickCommandService } from '@theia/core/lib/browser';

type CodeEditorWidget = EditorWidget | WebviewWidget;
@injectable()
export class CodeEditorWidgetUtil {
    is(arg: any): arg is CodeEditorWidget {
        return arg instanceof EditorWidget || arg instanceof WebviewWidget;
    }
    getResourceUri(editor: CodeEditorWidget): CodeUri | undefined {
        const resourceUri = Navigatable.is(editor) && editor.getResourceUri();
        return resourceUri ? resourceUri['codeUri'] : undefined;
    }
}

@injectable()
export class MenusContributionPointHandler {

    @inject(MenuModelRegistry)
    protected readonly menuRegistry: MenuModelRegistry;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(ScmService)
    protected readonly scmService: ScmService;

    @inject(QuickCommandService) @optional()
    protected readonly quickCommandService: QuickCommandService;

    @inject(TabBarToolbarRegistry)
    protected readonly tabBarToolbar: TabBarToolbarRegistry;

    @inject(SelectionService)
    protected readonly selectionService: SelectionService;

    @inject(ResourceContextKey)
    protected readonly resourceContextKey: ResourceContextKey;

    @inject(ViewContextKeyService)
    protected readonly viewContextKeys: ViewContextKeyService;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(CodeEditorWidgetUtil)
    protected readonly codeEditorWidgetUtil: CodeEditorWidgetUtil;

    handle(plugin: DeployedPlugin): Disposable {
        const allMenus = plugin.contributes && plugin.contributes.menus;
        if (!allMenus) {
            return Disposable.NULL;
        }
        const toDispose = new DisposableCollection();

        const tree = this.getMenusTree(plugin);
        tree.forEach(rootMenu => {

            const registerMenuActions = (menus: MenuTree[], group: string | undefined, submenusOrder: string | undefined = '') => {
                menus.forEach(menu => {
                    if (group) {
                        // Adding previous group to the start of current menu group.
                        menu.group = `${group}/${menu.group || '_'}`;
                    }
                    if (menu.isSubmenu) {
                        let [submenuGroup, submenuOrder = ''] = (menu.group || '_').split('@');
                        // Generating group in format: `<submenu group>/<submenu name>`
                        submenuGroup = `${submenuGroup}/${menu.label}`;
                        if (submenusOrder) {
                            // Adding previous submenus order to the start of current submenu order
                            // in format: `<submenu order>/<submenu order>.../<menu order>`.
                            submenuOrder = `${submenusOrder}/${submenuOrder}`;
                        }
                        registerMenuActions(menu.children, submenuGroup, submenuOrder);
                    } else {
                        menu.submenusOrder = submenusOrder;
                        toDispose.push(
                            this.registerAction(plugin, rootMenu.id!, menu)
                        );
                    }
                });
            };

            registerMenuActions(rootMenu.children, undefined, undefined);
        });

        return toDispose;
    }

    /**
     * Transforms the structure of Menus & Submenus
     * into something more tree-like.
     */
    protected getMenusTree(plugin: DeployedPlugin): MenuTree[] {
        const allMenus = plugin.contributes && plugin.contributes.menus;
        if (!allMenus) {
            return [];
        }
        const allSubmenus = plugin.contributes && plugin.contributes.submenus;
        const tree: MenuTree[] = [];

        Object.keys(allMenus).forEach(location => {
            // Don't build menus tree for a submenu declaration at root.
            if (allSubmenus && allSubmenus.findIndex(submenu => submenu.id === location) > -1) {
                return;
            }

            /**
             * @param menus the menus to create a tree from.
             * @param submenusIds contains all the previous submenus ids in the current tree.
             * @returns {MenuTree[]} the trees for the given menus.
             */
            const getChildren = (menus: Menu[], submenusIds: Set<string>) => {
                // Contains all the submenus ids of the current parent.
                const parentSubmenusIds = new Set<string>();

                return menus.reduce((children: MenuTree[], menuItem) => {
                    if (menuItem.submenu) {
                        if (parentSubmenusIds.has(menuItem.submenu)) {
                            console.warn(`Submenu ${menuItem.submenu} already registered`);
                        } else if (submenusIds.has(menuItem.submenu)) {
                            console.warn(`Found submenu cycle: ${menuItem.submenu}`);
                        } else {
                            parentSubmenusIds.add(menuItem.submenu);
                            const submenu = allSubmenus!.find(s => s.id === menuItem.submenu)!;
                            const menuTree = new MenuTree({ ...menuItem }, menuItem.submenu, submenu.label);
                            menuTree.children = getChildren(allMenus[submenu.id], new Set([...submenusIds, menuItem.submenu]));
                            children.push(menuTree);
                        }
                    } else {
                        children.push(new MenuTree({ ...menuItem }));
                    }
                    return children;
                }, []);
            };

            const rootMenu = new MenuTree(undefined, location);
            rootMenu.children = getChildren(allMenus[location], new Set());
            tree.push(rootMenu);
        });

        return tree;
    }

    protected registerAction(plugin: DeployedPlugin, location: string, action: MenuTree): Disposable {
        const allMenus = plugin.contributes && plugin.contributes.menus;
        if (!allMenus) {
            return Disposable.NULL;
        }

        switch (location) {
            case 'commandPalette': return this.registerCommandPaletteAction(action);
            case 'editor/title': return this.registerEditorTitleAction(location, action);
            case 'view/title': return this.registerViewTitleAction(location, action);
            case 'view/item/context': return this.registerViewItemContextAction(action);
            case 'scm/title': return this.registerScmTitleAction(location, action);
            case 'scm/resourceGroup/context': return this.registerScmResourceGroupAction(action);
            case 'scm/resourceFolder/context': return this.registerScmResourceFolderAction(action);
            case 'scm/resourceState/context': return this.registerScmResourceStateAction(action);
            case 'timeline/item/context': return this.registerTimelineItemAction(action);
            case 'comments/commentThread/context': return this.registerCommentThreadAction(action, plugin);
            case 'comments/comment/title': return this.registerCommentTitleAction(action);
            case 'comments/comment/context': return this.registerCommentContextAction(action);
            case 'debug/callstack/context': return this.registerDebugCallstackAction(action);

            default: if (allMenus.hasOwnProperty(location)) {
                return this.registerGlobalMenuAction(action, location, plugin);
            }
                return Disposable.NULL;
        }
    }

    protected static parseMenuPaths(value: string): MenuPath[] {
        switch (value) {
            case 'editor/context': return [EDITOR_CONTEXT_MENU];
            case 'explorer/context': return [NAVIGATOR_CONTEXT_MENU];
        }
        return [];
    }

    protected registerCommandPaletteAction(menu: Menu): Disposable {
        if (menu.command && menu.when) {
            return this.quickCommandService.pushCommandContext(menu.command, menu.when);
        }
        return Disposable.NULL;
    }

    protected registerEditorTitleAction(location: string, action: Menu): Disposable {
        return this.registerTitleAction(location, action, {
            execute: widget => this.codeEditorWidgetUtil.is(widget) &&
                this.commands.executeCommand(action.command!, this.codeEditorWidgetUtil.getResourceUri(widget)),
            isEnabled: widget => this.codeEditorWidgetUtil.is(widget) && this.commands.isEnabled(action.command!, this.codeEditorWidgetUtil.getResourceUri(widget)),
            isVisible: widget => this.codeEditorWidgetUtil.is(widget) && this.commands.isVisible(action.command!, this.codeEditorWidgetUtil.getResourceUri(widget))
        });
    }

    protected registerViewTitleAction(location: string, action: Menu): Disposable {
        return this.registerTitleAction(location, action, {
            execute: widget => widget instanceof PluginViewWidget && this.commands.executeCommand(action.command!),
            isEnabled: widget => widget instanceof PluginViewWidget && this.commands.isEnabled(action.command!),
            isVisible: widget => widget instanceof PluginViewWidget && this.commands.isVisible(action.command!),
        });
    }

    protected registerViewItemContextAction(menu: MenuTree): Disposable {
        const inline = menu.group && /^inline/.test(menu.group) || false;
        const menuPath = inline ? VIEW_ITEM_INLINE_MENU : VIEW_ITEM_CONTEXT_MENU;
        return this.registerTreeMenuAction(menuPath, menu);
    }

    protected registerScmResourceGroupAction(menu: MenuTree): Disposable {
        const inline = menu.group && /^inline/.test(menu.group) || false;
        const menuPath = inline ? ScmTreeWidget.RESOURCE_GROUP_INLINE_MENU : ScmTreeWidget.RESOURCE_GROUP_CONTEXT_MENU;
        return this.registerScmMenuAction(menuPath, menu);
    }

    protected registerScmResourceFolderAction(menu: MenuTree): Disposable {
        const inline = menu.group && /^inline/.test(menu.group) || false;
        const menuPath = inline ? ScmTreeWidget.RESOURCE_FOLDER_INLINE_MENU : ScmTreeWidget.RESOURCE_FOLDER_CONTEXT_MENU;
        return this.registerScmMenuAction(menuPath, menu);
    }

    protected registerScmResourceStateAction(menu: MenuTree): Disposable {
        const inline = menu.group && /^inline/.test(menu.group) || false;
        const menuPath = inline ? ScmTreeWidget.RESOURCE_INLINE_MENU : ScmTreeWidget.RESOURCE_CONTEXT_MENU;
        return this.registerScmMenuAction(menuPath, menu);
    }

    protected registerTimelineItemAction(menu: MenuTree): Disposable {
        return this.registerMenuAction(TIMELINE_ITEM_CONTEXT_MENU, menu,
            command => ({
                execute: (...args) => this.commands.executeCommand(command, ...this.toTimelineArgs(...args)),
                isEnabled: (...args) => this.commands.isEnabled(command, ...this.toTimelineArgs(...args)),
                isVisible: (...args) => this.commands.isVisible(command, ...this.toTimelineArgs(...args))
            }));
    }

    protected registerCommentThreadAction(menu: MenuTree, plugin: DeployedPlugin): Disposable {
        return this.registerMenuAction(COMMENT_THREAD_CONTEXT, menu,
            command => ({
                execute: (...args) => this.commands.executeCommand(command, ...this.toCommentArgs(...args)),
                isEnabled: () => {
                    const commandContributions = plugin.contributes?.commands;
                    if (commandContributions) {
                        const commandContribution = commandContributions.find(c => c.command === command);
                        if (commandContribution && commandContribution.enablement) {
                            return this.contextKeyService.match(commandContribution.enablement);
                        }
                    }
                    return true;
                },
                isVisible: (...args) => this.commands.isVisible(command, ...this.toCommentArgs(...args))
            }));
    }

    protected registerCommentTitleAction(menu: MenuTree): Disposable {
        return this.registerMenuAction(COMMENT_TITLE, menu,
            command => ({
                execute: (...args) => this.commands.executeCommand(command, ...this.toCommentArgs(...args)),
                isEnabled: (...args) => this.commands.isEnabled(command, ...this.toCommentArgs(...args)),
                isVisible: (...args) => this.commands.isVisible(command, ...this.toCommentArgs(...args))
            }));
    }

    protected registerCommentContextAction(menu: MenuTree): Disposable {
        return this.registerMenuAction(COMMENT_CONTEXT, menu,
            command => ({
                execute: (...args) => this.commands.executeCommand(command, ...this.toCommentArgs(...args)),
                isEnabled: () => true,
                isVisible: (...args) => this.commands.isVisible(command, ...this.toCommentArgs(...args))
            }));
    }

    protected registerDebugCallstackAction(menu: MenuTree): Disposable {
        const toDispose = new DisposableCollection();
        [DebugStackFramesWidget.CONTEXT_MENU, DebugThreadsWidget.CONTEXT_MENU].forEach(menuPath => {
            toDispose.push(
                this.registerMenuAction(menuPath, menu, command => ({
                    execute: (...args) => this.commands.executeCommand(command, args[0]),
                    isEnabled: (...args) => this.commands.isEnabled(command, args[0]),
                    isVisible: (...args) => this.commands.isVisible(command, args[0])
                })));
        });
        return toDispose;
    }

    protected registerTreeMenuAction(menuPath: MenuPath, menu: MenuTree): Disposable {
        return this.registerMenuAction(menuPath, menu, command => ({
            execute: (...args) => this.commands.executeCommand(command, ...this.toTreeArgs(...args)),
            isEnabled: (...args) => this.commands.isEnabled(command, ...this.toTreeArgs(...args)),
            isVisible: (...args) => this.commands.isVisible(command, ...this.toTreeArgs(...args))
        }));
    }
    protected toTreeArgs(...args: any[]): any[] {
        const treeArgs: any[] = [];
        for (const arg of args) {
            if (TreeViewSelection.is(arg)) {
                treeArgs.push(arg);
            }
        }
        return treeArgs;
    }

    protected registerTitleAction(location: string, action: Menu, handler: CommandHandler): Disposable {
        if (!action.command) {
            return Disposable.NULL;
        }
        const toDispose = new DisposableCollection();
        const id = this.createSyntheticCommandId(action.command, { prefix: `__plugin.${location.replace('/', '.')}.action.` });
        const command: Command = { id };
        toDispose.push(this.commands.registerCommand(command, handler));

        const { when } = action;
        const whenKeys = when && this.contextKeyService.parseKeys(when);
        let onDidChange;
        if (whenKeys && whenKeys.size) {
            const onDidChangeEmitter = new Emitter<void>();
            toDispose.push(onDidChangeEmitter);
            onDidChange = onDidChangeEmitter.event;
            this.contextKeyService.onDidChange.maxListeners = this.contextKeyService.onDidChange.maxListeners + 1;
            toDispose.push(this.contextKeyService.onDidChange(event => {
                if (event.affects(whenKeys)) {
                    onDidChangeEmitter.fire(undefined);
                }
            }));
            toDispose.push(Disposable.create(() => {
                this.contextKeyService.onDidChange.maxListeners = this.contextKeyService.onDidChange.maxListeners - 1;
            }));
        }

        // handle group and priority
        // if group is empty or white space is will be set to navigation
        // ' ' => ['navigation', 0]
        // 'navigation@1' => ['navigation', 1]
        // '1_rest-client@2' => ['1_rest-client', 2]
        // if priority is not a number it will be set to 0
        // navigation@test => ['navigation', 0]
        const [group, sort] = (action.group || 'navigation').split('@');
        const item: Mutable<TabBarToolbarItem> = { id, command: id, group: group.trim() || 'navigation', priority: ~~sort || undefined, when, onDidChange };
        toDispose.push(this.tabBarToolbar.registerItem(item));

        toDispose.push(this.onDidRegisterCommand(action.command, pluginCommand => {
            command.category = pluginCommand.category;
            item.tooltip = pluginCommand.label;
            if (group === 'navigation') {
                command.iconClass = pluginCommand.iconClass;
            }
        }));
        return toDispose;
    }

    protected registerScmTitleAction(location: string, action: Menu): Disposable {
        if (!action.command) {
            return Disposable.NULL;
        }
        const selectedRepository = () => this.toScmArg(this.scmService.selectedRepository);
        return this.registerTitleAction(location, action, {
            execute: widget => widget instanceof ScmWidget && this.commands.executeCommand(action.command!, selectedRepository()),
            isEnabled: widget => widget instanceof ScmWidget && this.commands.isEnabled(action.command!, selectedRepository()),
            isVisible: widget => widget instanceof ScmWidget && this.commands.isVisible(action.command!, selectedRepository())
        });
    }
    protected registerScmMenuAction(menuPath: MenuPath, menu: MenuTree): Disposable {
        return this.registerMenuAction(menuPath, menu, command => ({
            execute: (...args) => this.commands.executeCommand(command, ...this.toScmArgs(...args)),
            isEnabled: (...args) => this.commands.isEnabled(command, ...this.toScmArgs(...args)),
            isVisible: (...args) => this.commands.isVisible(command, ...this.toScmArgs(...args))
        }));
    }
    protected toScmArgs(...args: any[]): any[] {
        const scmArgs: any[] = [];
        for (const arg of args) {
            const scmArg = this.toScmArg(arg);
            if (scmArg) {
                scmArgs.push(scmArg);
            }
        }
        return scmArgs;
    }
    protected toScmArg(arg: any): ScmCommandArg | undefined {
        if (arg instanceof ScmRepository && arg.provider instanceof PluginScmProvider) {
            return {
                sourceControlHandle: arg.provider.handle
            };
        }
        if (arg instanceof PluginScmResourceGroup) {
            return {
                sourceControlHandle: arg.provider.handle,
                resourceGroupHandle: arg.handle
            };
        }
        if (arg instanceof PluginScmResource) {
            return {
                sourceControlHandle: arg.group.provider.handle,
                resourceGroupHandle: arg.group.handle,
                resourceStateHandle: arg.handle
            };
        }
    }

    protected toTimelineArgs(...args: any[]): any[] {
        const timelineArgs: any[] = [];
        const arg = args[0];
        timelineArgs.push(this.toTimelineArg(arg));
        timelineArgs.push(CodeUri.parse(arg.uri));
        timelineArgs.push('source' in arg ? arg.source : '');
        return timelineArgs;
    }
    protected toTimelineArg(arg: TimelineItem): TimelineCommandArg {
        return {
            timelineHandle: arg.handle,
            source: arg.source,
            uri: arg.uri
        };
    }

    protected toCommentArgs(...args: any[]): any[] {
        const arg = args[0];
        if ('text' in arg) {
            if ('commentUniqueId' in arg) {
                return [{
                    commentControlHandle: arg.thread.controllerHandle,
                    commentThreadHandle: arg.thread.commentThreadHandle,
                    text: arg.text,
                    commentUniqueId: arg.commentUniqueId
                }];
            }
            return [{
                commentControlHandle: arg.thread.controllerHandle,
                commentThreadHandle: arg.thread.commentThreadHandle,
                text: arg.text
            }];
        }
        return [{
            commentControlHandle: arg.thread.controllerHandle,
            commentThreadHandle: arg.thread.commentThreadHandle,
            commentUniqueId: arg.commentUniqueId
        }];
    }

    protected registerGlobalMenuAction(menu: MenuTree, location: string, plugin: DeployedPlugin): Disposable {
        const menuPaths = MenusContributionPointHandler.parseMenuPaths(location);
        if (!menuPaths.length) {
            this.logger.warn(`'${plugin.metadata.model.id}' plugin contributes items to a menu with invalid identifier: ${location}`);
            return Disposable.NULL;
        }

        const selectedResource = () => {
            const selection = this.selectionService.selection;
            if (TreeWidgetSelection.is(selection) && selection.source instanceof TreeViewWidget && selection[0]) {
                return selection.source.toTreeViewSelection(selection[0]);
            }
            const uri = this.resourceContextKey.get();
            return uri ? uri['codeUri'] : undefined;
        };

        const toDispose = new DisposableCollection();
        menuPaths.forEach(menuPath => {
            toDispose.push(this.registerMenuAction(menuPath, menu, command => ({
                execute: () => this.commands.executeCommand(command, selectedResource()),
                isEnabled: () => this.commands.isEnabled(command, selectedResource()),
                isVisible: () => this.commands.isVisible(command, selectedResource())
            })));
        });
        return toDispose;
    }

    protected registerMenuAction(menuPath: MenuPath, menu: MenuTree, handler: (command: string) => CommandHandler): Disposable {
        if (!menu.command) {
            return Disposable.NULL;
        }
        const toDispose = new DisposableCollection();
        const commandId = this.createSyntheticCommandId(menu.command, { prefix: '__plugin.menu.action.' });
        const command: Command = { id: commandId };
        toDispose.push(this.commands.registerCommand(command, handler(menu.command)));
        toDispose.push(this.quickCommandService?.pushCommandContext(commandId, 'false'));

        let altId: string | undefined;
        if (menu.alt) {
            altId = this.createSyntheticCommandId(menu.alt, { prefix: '__plugin.menu.action.' });
            const alt: Command = { id: altId };
            toDispose.push(this.commands.registerCommand(alt, handler(menu.alt)));
            toDispose.push(this.quickCommandService?.pushCommandContext(altId, 'false'));
            toDispose.push(this.onDidRegisterCommand(menu.alt, pluginCommand => {
                alt.category = pluginCommand.category;
                alt.label = pluginCommand.label;
                if (inline) {
                    alt.iconClass = pluginCommand.iconClass;
                }
            }));
        }

        const { when } = menu;
        const [group, order = undefined] = (menu.group || '_').split('@');
        const action: MenuAction = { commandId, alt: altId, order, when };

        // Register a submenu if the group is in format `<submenu group>/<submenu name>/<submenu order>.../<menu group>`
        if (group!.indexOf('/') !== -1) {
            const groupSplit = group!.split('/');
            const orderSplit = (menu.submenusOrder || '').split('/');
            const paths: string[] = [];
            for (let i = 0, j = 0; i < groupSplit.length - 1; i += 2, j += 1) {
                const submenuGroup = groupSplit[i];
                const submenuLabel = groupSplit[i + 1];
                const submenuOrder = orderSplit[j];
                paths.push(submenuGroup, submenuLabel);
                toDispose.push(this.menuRegistry.registerSubmenu([...menuPath, ...paths], submenuLabel, { order: submenuOrder }));
            }
        }
        const inline = /^inline/.test(group);
        menuPath = inline ? menuPath : [...menuPath, ...group.split('/')];
        toDispose.push(this.menuRegistry.registerMenuAction(menuPath, action));

        toDispose.push(this.onDidRegisterCommand(menu.command, pluginCommand => {
            command.category = pluginCommand.category;
            command.label = pluginCommand.label;
            if (inline) {
                command.iconClass = pluginCommand.iconClass;
            }
        }));
        return toDispose;
    }

    protected createSyntheticCommandId(command: string, { prefix }: { prefix: string }): string {
        let id = prefix + command;
        let index = 0;
        while (this.commands.getCommand(id)) {
            id = prefix + command + ':' + index;
            index++;
        }
        return id;
    }

    protected onDidRegisterCommand(id: string, cb: (command: Command) => void): Disposable {
        const command = this.commands.getCommand(id);
        if (command) {
            cb(command);
            return Disposable.NULL;
        }
        const toDispose = new DisposableCollection();
        // Registering a menu action requires the related command to be already registered.
        // But Theia plugin registers the commands dynamically via the Commands API.
        // Let's wait for ~2 sec. It should be enough to finish registering all the contributed commands.
        // FIXME: remove this workaround (timer) once the https://github.com/theia-ide/theia/issues/3344 is fixed
        const handle = setTimeout(() => toDispose.push(this.onDidRegisterCommand(id, cb)), 2000);
        toDispose.push(Disposable.create(() => clearTimeout(handle)));
        return toDispose;
    }

}

/**
 * MenuTree representing a (sub)menu in the menu tree structure.
 */
export class MenuTree implements Menu {

    protected _children: MenuTree[] = [];
    command?: string;
    alt?: string;
    group?: string;
    when?: string;
    /** The orders of the menu items which lead to the submenus */
    submenusOrder?: string;

    constructor(menu?: Menu,
        /** The location where the menu item will be open from. */
        public readonly id?: string,
        /** The label of the menu item which leads to the submenu. */
        public label?: string) {
        if (menu) {
            this.command = menu.command;
            this.alt = menu.alt;
            this.group = menu.group;
            this.when = menu.when;
        }
    }

    get children(): MenuTree[] {
        return this._children;
    }
    set children(items: MenuTree[]) {
        this._children.push(...items);
    }

    public addChild(node: MenuTree): void {
        this._children.push(node);
    }

    get isSubmenu(): boolean {
        return this.label !== undefined;
    }
}
