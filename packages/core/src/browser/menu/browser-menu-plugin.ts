// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import { Menu, MenuBar, Menu as MenuWidget, Widget } from '@lumino/widgets';
import { CommandRegistry as LuminoCommandRegistry } from '@lumino/commands';
import {
    environment, DisposableCollection,
    AcceleratorSource,
    ArrayUtils,
    PreferenceService,
    CommandRegistry
} from '../../common';
import { KeybindingRegistry } from '../keybinding';
import { FrontendApplication } from '../frontend-application';
import { FrontendApplicationContribution } from '../frontend-application-contribution';
import { ContextKeyService, ContextMatcher } from '../context-key-service';
import { ContextMenuContext } from './context-menu-context';
import { Message, waitForRevealed } from '../widgets';
import { ApplicationShell } from '../shell';
import { CorePreferences } from '../../common/core-preferences';
import { ElementExt } from '@lumino/domutils';
import { CommonCommands } from '../common-commands';
import { nls } from '../../common/nls';
import { CommandMenu, CompoundMenuNode, MAIN_MENU_BAR, MenuNode, MenuPath, RenderedMenuNode, Submenu } from '../../common/menu/menu-types';
import { MenuModelRegistry } from '../../common/menu/menu-model-registry';

export abstract class MenuBarWidget extends MenuBar {
    abstract activateMenu(label: string, ...labels: string[]): Promise<MenuWidget>;
    abstract triggerMenuItem(label: string, ...labels: string[]): Promise<MenuWidget.IItem>;
}

export interface BrowserMenuOptions extends MenuWidget.IOptions {
    context?: HTMLElement,
};

@injectable()
export class BrowserMainMenuFactory implements MenuWidgetFactory {

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(ContextMenuContext)
    protected readonly context: ContextMenuContext;

    @inject(CorePreferences)
    protected readonly corePreferences: CorePreferences;

    @inject(KeybindingRegistry)
    protected readonly keybindingRegistry: KeybindingRegistry;

    @inject(MenuModelRegistry)
    protected readonly menuProvider: MenuModelRegistry;

    createMenuBar(): MenuBarWidget {
        const menuBar = new DynamicMenuBarWidget();
        menuBar.id = 'theia:menubar';
        this.corePreferences.ready.then(() => {
            this.showMenuBar(menuBar);
        });
        const disposable = new DisposableCollection(
            this.corePreferences.onPreferenceChanged(change => {
                if (change.preferenceName === 'window.menuBarVisibility') {
                    this.showMenuBar(menuBar, this.corePreferences['window.menuBarVisibility']);
                }
            }),
            this.keybindingRegistry.onKeybindingsChanged(() => {
                this.showMenuBar(menuBar);
            }),
            this.menuProvider.onDidChange(evt => {
                if (ArrayUtils.startsWith(evt.path, MAIN_MENU_BAR)) {
                    this.showMenuBar(menuBar);
                }
            })
        );
        menuBar.disposed.connect(() => disposable.dispose());
        return menuBar;
    }

    protected getMenuBarVisibility(): string {
        return this.corePreferences.get('window.menuBarVisibility', 'classic');
    }

    protected showMenuBar(menuBar: DynamicMenuBarWidget, preference = this.getMenuBarVisibility()): void {
        if (preference && ['classic', 'visible'].includes(preference)) {
            menuBar.clearMenus();
            this.fillMenuBar(menuBar);
        } else {
            menuBar.clearMenus();
        }
    }

    protected fillMenuBar(menuBar: MenuBarWidget): void {
        const menuModel = this.menuProvider.getMenuNode(MAIN_MENU_BAR) as Submenu;
        const menuCommandRegistry = new LuminoCommandRegistry();
        for (const menu of menuModel.children) {
            if (CompoundMenuNode.is(menu) && RenderedMenuNode.is(menu)) {
                const menuWidget = this.createMenuWidget(MAIN_MENU_BAR, menu, this.contextKeyService, { commands: menuCommandRegistry });
                menuBar.addMenu(menuWidget);
            }
        }
    }

    createContextMenu(effectiveMenuPath: MenuPath, menuModel: CompoundMenuNode, contextMatcher: ContextMatcher, args?: unknown[], context?: HTMLElement): MenuWidget {
        const menuCommandRegistry = new LuminoCommandRegistry();
        const contextMenu = this.createMenuWidget(effectiveMenuPath, menuModel, contextMatcher, { commands: menuCommandRegistry, context }, args);
        return contextMenu;
    }

    createMenuWidget(parentPath: MenuPath, menu: CompoundMenuNode, contextMatcher: ContextMatcher, options: BrowserMenuOptions, args?: unknown[]): DynamicMenuWidget {
        return new DynamicMenuWidget(parentPath, menu, options, contextMatcher, this.services, args);
    }

    protected get services(): MenuServices {
        return {
            contextKeyService: this.contextKeyService,
            context: this.context,
            menuWidgetFactory: this,
        };
    }

}

export function isMenuElement(element: HTMLElement | null): boolean {
    return !!element && element.className.includes('lm-Menu');
}

export class DynamicMenuBarWidget extends MenuBarWidget {

    /**
     * We want to restore the focus after the menu closes.
     */
    protected previousFocusedElement: HTMLElement | undefined;

    constructor() {
        // Disable Lumino's overflow menu feature. The feature has a bug where
        // `onUpdateRequest` consumes a stale `_overflowIndex` (only recomputed at the
        // end of the method), which causes a RangeError when the menu bar is rendered
        // at zero width. Additionally, Theia's CSS does not constrain the menu bar's
        // offsetWidth to the available space, so the overflow detection never triggers.
        // See https://github.com/eclipse-theia/theia/issues/17352
        // See https://github.com/jupyterlab/lumino/issues/811
        super({ overflowMenuOptions: { isVisible: false } });
        // HACK we need to hook in on private method _openChildMenu. Don't do this at home!
        DynamicMenuBarWidget.prototype['_openChildMenu'] = () => {
            if (this.activeMenu instanceof DynamicMenuWidget) {
                // `childMenu` is `null` if we open the menu. For example, menu is not shown and you click on `Edit`.
                // However, the `childMenu` is set, when `Edit` was already open and you move the mouse over `Select`.
                // We want to save the focus object for the former case only.
                if (!this.childMenu) {
                    const { activeElement } = document;
                    // we do not want to restore focus to menus
                    if (activeElement instanceof HTMLElement && !isMenuElement(activeElement)) {
                        this.previousFocusedElement = activeElement;
                    }
                }
                this.activeMenu.aboutToShow({ previousFocusedElement: this.previousFocusedElement });
            }
            super['_openChildMenu']();
        };
    }

    async activateMenu(label: string, ...labels: string[]): Promise<MenuWidget> {
        const menu = this.menus.find(m => m.title.label === label);
        if (!menu) {
            throw new Error(`could not find '${label}' menu`);
        }
        this.activeMenu = menu;
        this.openActiveMenu();
        await waitForRevealed(menu);

        const menuPath = [label, ...labels];

        let current = menu;
        for (const itemLabel of labels) {
            const item = current.items.find(i => i.label === itemLabel);
            if (!item || !item.submenu) {
                throw new Error(`could not find '${itemLabel}' submenu in ${menuPath.map(l => "'" + l + "'").join(' -> ')} menu`);
            }
            current.activeItem = item;
            current.triggerActiveItem();
            current = item.submenu;
            await waitForRevealed(current);
        }
        return current;
    }

    async triggerMenuItem(label: string, ...labels: string[]): Promise<MenuWidget.IItem> {
        if (!labels.length) {
            throw new Error('menu item label is not specified');
        }
        const menuPath = [label, ...labels.slice(0, labels.length - 1)];
        const menu = await this.activateMenu(menuPath[0], ...menuPath.slice(1));
        const item = menu.items.find(i => i.label === labels[labels.length - 1]);
        if (!item) {
            throw new Error(`could not find '${labels[labels.length - 1]}' item in ${menuPath.map(l => "'" + l + "'").join(' -> ')} menu`);
        }
        menu.activeItem = item;
        menu.triggerActiveItem();
        return item;
    }

}

export class MenuServices {
    readonly contextKeyService: ContextKeyService;
    readonly context: ContextMenuContext;
    readonly menuWidgetFactory: MenuWidgetFactory;
}

export interface MenuWidgetFactory {
    createMenuWidget(effectiveMenuPath: MenuPath, menu: Submenu, contextMatcher: ContextMatcher, options: BrowserMenuOptions, args?: unknown[]): MenuWidget;
}

/**
 * A menu widget that would recompute its items on update.
 */
export class DynamicMenuWidget extends MenuWidget {
    private static nextCommmandId = 0;
    /**
     * We want to restore the focus after the menu closes.
     */
    protected previousFocusedElement: HTMLElement | undefined;

    constructor(
        protected readonly effectiveMenuPath: MenuPath,
        protected menu: CompoundMenuNode,
        protected options: BrowserMenuOptions,
        protected contextMatcher: ContextMatcher,
        protected services: MenuServices,
        protected args?: unknown[]
    ) {
        super(options);
        if (RenderedMenuNode.is(this.menu)) {
            if (this.menu.label) {
                this.title.label = this.menu.label;
            }
            if (this.menu.icon) {
                this.title.iconClass = this.menu.icon;
            }
        }
        this.updateSubMenus(this.effectiveMenuPath, this, this.menu, this.options.commands, this.contextMatcher, this.options.context);
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.node.ownerDocument.addEventListener('pointerdown', this, true);
    }

    protected override onBeforeDetach(msg: Message): void {
        this.node.ownerDocument.removeEventListener('pointerdown', this, true);
        super.onBeforeDetach(msg);
    }

    override handleEvent(event: Event): void {
        if (event.type === 'pointerdown') {
            this.handlePointerDown(event as PointerEvent);
        }
        super.handleEvent(event);
    }

    handlePointerDown(event: PointerEvent): void {
        // this code is copied from the superclass because we cannot use the hit
        // test from the "Private" implementation namespace
        if (this['_parentMenu']) {
            return;
        }

        // The mouse button which is pressed is irrelevant. If the press
        // is not on a menu, the entire hierarchy is closed and the event
        // is allowed to propagate. This allows other code to act on the
        // event, such as focusing the clicked element.
        if (!this.hitTestMenus(this, event.clientX, event.clientY)) {
            this.close();
        }
    }

    private hitTestMenus(menu: Menu, x: number, y: number): boolean {
        for (let temp: Menu | null = menu; temp; temp = temp.childMenu) {
            if (ElementExt.hitTest(temp.node, x, y)) {
                return true;
            }
        }
        return false;
    }

    public aboutToShow({ previousFocusedElement }: { previousFocusedElement: HTMLElement | undefined }): void {
        this.preserveFocusedElement(previousFocusedElement);
        this.clearItems();
        this.runWithPreservedFocusContext(() => {
            this.updateSubMenus(this.effectiveMenuPath, this, this.menu, this.options.commands, this.contextMatcher, this.options.context);
        });
    }

    public override open(x: number, y: number, options?: MenuWidget.IOpenOptions): void {
        const cb = () => {
            this.restoreFocusedElement();
            this.aboutToClose.disconnect(cb);
        };
        this.aboutToClose.connect(cb);
        this.preserveFocusedElement();
        super.open(x, y, options);
    }

    protected updateSubMenus(parentPath: MenuPath, parent: MenuWidget, menu: CompoundMenuNode, commands: LuminoCommandRegistry,
        contextMatcher: ContextMatcher, context?: HTMLElement | undefined): void {
        const items = this.createItems(parentPath, menu.children, commands, contextMatcher, context);
        while (items[items.length - 1]?.type === 'separator') {
            items.pop();
        }
        for (const item of items) {
            parent.addItem(item);
        }
    }

    protected createItems(parentPath: MenuPath, nodes: MenuNode[], phCommandRegistry: LuminoCommandRegistry,
        contextMatcher: ContextMatcher, context?: HTMLElement): MenuWidget.IItemOptions[] {
        const result: MenuWidget.IItemOptions[] = [];

        for (const node of nodes) {
            const nodePath = node.effectiveMenuPath || [...parentPath, node.id];
            if (node.isVisible(nodePath, contextMatcher, context, ...(this.args || []))) {
                if (CompoundMenuNode.is(node)) {
                    if (RenderedMenuNode.is(node)) {
                        const submenu = this.services.menuWidgetFactory.createMenuWidget(nodePath, node, this.contextMatcher, this.options, this.args);
                        if (submenu.items.length > 0) {
                            result.push({ type: 'submenu', submenu });
                        }
                    } else if (node.id !== 'inline') {
                        const items = this.createItems(nodePath, node.children, phCommandRegistry, contextMatcher, context);
                        if (items.length > 0) {
                            if (result[result.length - 1]?.type !== 'separator') {
                                result.push({ type: 'separator' });
                            }
                            result.push(...items);
                            result.push({ type: 'separator' });
                        }
                    }

                } else if (CommandMenu.is(node)) {
                    const id = !phCommandRegistry.hasCommand(node.id) ? node.id : `${node.id}:${DynamicMenuWidget.nextCommmandId++}`;
                    const enabled = node.isEnabled(nodePath, ...(this.args || []));
                    const toggled = node.isToggled ? !!node.isToggled(nodePath, ...(this.args || [])) : false;
                    phCommandRegistry.addCommand(id, {
                        execute: () => {
                            // Restore focus to the previously focused element before executing
                            // the command so that focus-dependent commands like clipboard
                            // operations target the correct element instead of the menu.
                            if (this.previousFocusedElement) {
                                this.previousFocusedElement.focus({ preventScroll: true });
                            }
                            node.run(nodePath, ...(this.args || []));
                        },
                        isEnabled: () => enabled,
                        isToggled: () => toggled,
                        isVisible: () => true,
                        label: node.label,
                        iconClass: node.icon,
                    });

                    const accelerator = (AcceleratorSource.is(node) ? node.getAccelerator(this.options.context) : []);
                    if (accelerator.length > 0) {
                        phCommandRegistry.addKeyBinding({
                            command: id,
                            keys: accelerator,
                            selector: '.p-Widget' // We have the PhosphorJS dependency anyway.
                        });
                    }
                    result.push({
                        command: id,
                        type: 'command'
                    });
                }
            }
        }
        return result;
    }

    protected preserveFocusedElement(previousFocusedElement: Element | null = document.activeElement): boolean {
        if (!this.previousFocusedElement && previousFocusedElement instanceof HTMLElement && !isMenuElement(previousFocusedElement)) {
            this.previousFocusedElement = previousFocusedElement;
            return true;
        }
        return false;
    }

    protected restoreFocusedElement(): boolean {
        if (this.previousFocusedElement) {
            this.previousFocusedElement.focus({ preventScroll: true });
            this.previousFocusedElement = undefined;
            return true;
        }
        return false;
    }

    protected runWithPreservedFocusContext(what: () => void): void {
        let focusToRestore: HTMLElement | undefined = undefined;
        const { activeElement } = document;
        if (this.previousFocusedElement &&
            activeElement instanceof HTMLElement &&
            this.previousFocusedElement !== activeElement) {
            focusToRestore = activeElement;
            this.previousFocusedElement.focus({ preventScroll: true });
        }
        try {
            what();
        } finally {
            if (focusToRestore && !isMenuElement(focusToRestore)) {
                focusToRestore.focus({ preventScroll: true });
            }
        }
    }

}

/** Command ids as strings so `@theia/core` does not depend on `@theia/editor` / terminal / ai-chat. */
const WORKBENCH_NAV_GO_BACK = 'textEditor.commands.go.back';
const WORKBENCH_NAV_GO_FORWARD = 'textEditor.commands.go.forward';
const WORKBENCH_TOGGLE_TERMINAL = 'workbench.action.terminal.toggleTerminal';
const WORKBENCH_AI_CHAT_TOGGLE = 'aiChat:toggle';
/** Matches `@theia/ai-chat-ui` ChatViewWidget.ID; used without depending on that package. */
const WORKBENCH_CHAT_VIEW_WIDGET_ID = 'chat-view-widget';
const WORKBENCH_MOBILE_MEDIA = '(max-width: 767px)';

/**
 * VS Code–style controls in the menu bar: primary sidebar toggle, Go Back, Go Forward (replaces the branding logo slot).
 */
class WorkbenchNavControlsWidget extends Widget {
    protected readonly toDispose = new DisposableCollection();
    protected readonly toggleBtn: HTMLButtonElement;
    protected readonly backBtn: HTMLButtonElement;
    protected readonly forwardBtn: HTMLButtonElement;

    constructor(protected readonly commands: CommandRegistry) {
        const node = document.createElement('div');
        node.classList.add('theia-workbench-nav-controls');
        super({ node });
        this.id = 'theia:workbench-nav';
        this.toggleBtn = WorkbenchNavControlsWidget.createBtn(
            'codicon codicon-layout-sidebar-left',
            CommonCommands.TOGGLE_LEFT_PANEL.label ?? 'Toggle Left Panel'
        );
        this.backBtn = WorkbenchNavControlsWidget.createBtn(
            'codicon codicon-arrow-left',
            nls.localizeByDefault('Go Back')
        );
        this.forwardBtn = WorkbenchNavControlsWidget.createBtn(
            'codicon codicon-arrow-right',
            nls.localizeByDefault('Go Forward')
        );
        node.append(this.toggleBtn, this.backBtn, this.forwardBtn);
        this.toggleBtn.addEventListener('click', this.onToggleClick);
        this.backBtn.addEventListener('click', this.onBackClick);
        this.forwardBtn.addEventListener('click', this.onForwardClick);
        const refresh = (): void => this.updateEnabledStates();
        this.toDispose.push(this.commands.onDidExecuteCommand(refresh));
        this.toDispose.push(this.commands.onCommandsChanged(refresh));
    }

    protected static createBtn(iconClasses: string, title: string): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `theia-workbench-nav-btn ${iconClasses}`;
        btn.title = title;
        return btn;
    }

    protected readonly onToggleClick = (): void => this.runIfEnabled(CommonCommands.TOGGLE_LEFT_PANEL.id);
    protected readonly onBackClick = (): void => this.runIfEnabled(WORKBENCH_NAV_GO_BACK);
    protected readonly onForwardClick = (): void => this.runIfEnabled(WORKBENCH_NAV_GO_FORWARD);

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.updateEnabledStates();
    }

    override dispose(): void {
        if (this.isDisposed) {
            return;
        }
        this.toDispose.dispose();
        this.toggleBtn.removeEventListener('click', this.onToggleClick);
        this.backBtn.removeEventListener('click', this.onBackClick);
        this.forwardBtn.removeEventListener('click', this.onForwardClick);
        super.dispose();
    }

    protected runIfEnabled(commandId: string): void {
        if (!this.commands.isEnabled(commandId)) {
            return;
        }
        void this.commands.executeCommand(commandId).catch(() => undefined);
    }

    protected updateEnabledStates(): void {
        this.toggleBtn.disabled = !this.commands.isEnabled(CommonCommands.TOGGLE_LEFT_PANEL.id);
        this.backBtn.disabled = !this.commands.isEnabled(WORKBENCH_NAV_GO_BACK);
        this.forwardBtn.disabled = !this.commands.isEnabled(WORKBENCH_NAV_GO_FORWARD);
    }

}

/**
 * Cursor-style actions on the right side of the title/menu bar: terminal, AI chat, settings.
 */
class WorkbenchRightControlsWidget extends Widget {
    protected readonly toDispose = new DisposableCollection();
    protected readonly terminalBtn: HTMLButtonElement;
    protected readonly aiChatBtn: HTMLButtonElement;
    protected readonly settingsBtn: HTMLButtonElement;

    constructor(
        protected readonly commands: CommandRegistry,
        protected readonly shell: ApplicationShell
    ) {
        const node = document.createElement('div');
        node.classList.add('theia-workbench-right-controls');
        super({ node });
        this.id = 'theia:workbench-right-controls';
        this.terminalBtn = WorkbenchRightControlsWidget.createBtn(
            'codicon codicon-terminal',
            nls.localize('theia/core/workbenchBar/toggleTerminal', 'Toggle Terminal')
        );
        this.terminalBtn.setAttribute('role', 'switch');
        this.aiChatBtn = WorkbenchRightControlsWidget.createBtn(
            'codicon codicon-comment-discussion',
            nls.localize('theia/core/workbenchBar/openAiChat', 'Open AI Chat')
        );
        this.settingsBtn = WorkbenchRightControlsWidget.createBtn(
            'codicon codicon-gear',
            CommonCommands.OPEN_PREFERENCES.label ?? nls.localizeByDefault('Open Settings')
        );
        node.append(this.terminalBtn, this.aiChatBtn, this.settingsBtn);
        this.terminalBtn.addEventListener('click', this.onTerminalClick);
        this.aiChatBtn.addEventListener('click', this.onAiChatClick);
        this.settingsBtn.addEventListener('click', this.onSettingsClick);
        const refresh = (): void => this.updateEnabledStates();
        this.toDispose.push(this.commands.onDidExecuteCommand(refresh));
        this.toDispose.push(this.commands.onCommandsChanged(refresh));
        this.toDispose.push(this.shell.onDidChangeActiveWidget(refresh));
        this.toDispose.push(this.shell.onDidChangeCurrentWidget(refresh));
        this.toDispose.push(this.shell.onDidAddWidget(refresh));
        this.toDispose.push(this.shell.onDidRemoveWidget(refresh));
    }

    protected static createBtn(iconClasses: string, title: string): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `theia-workbench-nav-btn ${iconClasses}`;
        btn.title = title;
        return btn;
    }

    protected readonly onTerminalClick = (): void => {
        if (this.commands.isEnabled(CommonCommands.TOGGLE_BOTTOM_PANEL.id)) {
            this.runIfEnabled(CommonCommands.TOGGLE_BOTTOM_PANEL.id);
        } else {
            this.runIfEnabled(WORKBENCH_TOGGLE_TERMINAL);
        }
    };
    protected readonly onAiChatClick = (): void => {
        this.dismissLeftSheetBeforeAiChat();
        this.runIfEnabled(WORKBENCH_AI_CHAT_TOGGLE);
    };
    protected readonly onSettingsClick = (): void => this.runIfEnabled(CommonCommands.OPEN_PREFERENCES.id);

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.updateEnabledStates();
    }

    override dispose(): void {
        if (this.isDisposed) {
            return;
        }
        this.toDispose.dispose();
        this.terminalBtn.removeEventListener('click', this.onTerminalClick);
        this.aiChatBtn.removeEventListener('click', this.onAiChatClick);
        this.settingsBtn.removeEventListener('click', this.onSettingsClick);
        super.dispose();
    }

    protected runIfEnabled(commandId: string): void {
        if (!this.commands.isEnabled(commandId)) {
            return;
        }
        void this.commands.executeCommand(commandId).catch(() => undefined);
    }

    protected dismissLeftSheetBeforeAiChat(): void {
        if (this.isNarrowMobileWorkbench() && this.shell.isExpanded('left')) {
            void this.shell.collapsePanel('left');
        }
    }

    protected isNarrowMobileWorkbench(): boolean {
        return typeof window !== 'undefined'
            && typeof window.matchMedia === 'function'
            && window.matchMedia(WORKBENCH_MOBILE_MEDIA).matches;
    }

    protected updateEnabledStates(): void {
        const canToggleBottom = this.commands.isEnabled(CommonCommands.TOGGLE_BOTTOM_PANEL.id);
        const canOpenTerminal = this.commands.isEnabled(WORKBENCH_TOGGLE_TERMINAL);
        this.terminalBtn.disabled = !canToggleBottom && !canOpenTerminal;
        this.aiChatBtn.disabled = !this.commands.isEnabled(WORKBENCH_AI_CHAT_TOGGLE);
        this.settingsBtn.disabled = !this.commands.isEnabled(CommonCommands.OPEN_PREFERENCES.id);
        this.updateTerminalSwitchVisual();
        this.updateAiChatSwitchVisual();
    }

    protected updateTerminalSwitchVisual(): void {
        const on = this.shell.isExpanded('bottom') && !this.shell.bottomPanel.isEmpty;
        this.terminalBtn.classList.toggle('theia-mod-toggled', on);
        this.terminalBtn.setAttribute('aria-checked', on ? 'true' : 'false');
        this.terminalBtn.title = on
            ? nls.localize('theia/core/workbenchBar/hideTerminal', 'Hide Terminal')
            : nls.localize('theia/core/workbenchBar/showTerminal', 'Show Terminal');
    }

    /** On narrow viewports the AI chat strip is optional; mirror terminal “switch” affordance when chat is open. */
    protected updateAiChatSwitchVisual(): void {
        const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
        if (!narrow) {
            this.aiChatBtn.classList.remove('theia-mod-toggled');
            this.aiChatBtn.title = nls.localize('theia/core/workbenchBar/openAiChat', 'Open AI Chat');
            return;
        }
        const title = this.shell.rightPanelHandler.tabBar.currentTitle;
        const on = this.shell.isExpanded('right') && title?.owner?.id === WORKBENCH_CHAT_VIEW_WIDGET_ID;
        this.aiChatBtn.classList.toggle('theia-mod-toggled', on);
        this.aiChatBtn.title = on
            ? nls.localize('theia/core/workbenchBar/hideAiChat', 'Hide AI Chat')
            : nls.localize('theia/core/workbenchBar/openAiChat', 'Open AI Chat');
    }
}

@injectable()
export class BrowserMenuBarContribution implements FrontendApplicationContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    constructor(
        @inject(BrowserMainMenuFactory) protected readonly factory: BrowserMainMenuFactory
    ) { }

    onStart(app: FrontendApplication): void {
        this.appendMenu(app.shell);
    }

    get menuBar(): MenuBarWidget | undefined {
        return this.shell.topPanel.widgets.find(w => w instanceof MenuBarWidget) as MenuBarWidget | undefined;
    }

    protected appendMenu(shell: ApplicationShell): void {
        const logo = this.createLogo();
        shell.addWidget(logo, { area: 'top' });
        const menu = this.factory.createMenuBar();
        shell.addWidget(menu, { area: 'top' });
        shell.addWidget(new WorkbenchRightControlsWidget(this.commandRegistry, shell), { area: 'top' });
        // Hiding the menu is only necessary in electron
        // In the browser we hide the whole top panel
        if (environment.electron.is()) {
            this.preferenceService.ready.then(() => {
                menu.setHidden(['compact', 'hidden'].includes(this.preferenceService.get('window.menuBarVisibility', '')));
            });
            this.preferenceService.onPreferenceChanged(change => {
                if (change.preferenceName === 'window.menuBarVisibility') {
                    menu.setHidden(['compact', 'hidden'].includes(this.preferenceService.get('window.menuBarVisibility', 'classic')));
                }
            });
        }
    }

    protected createLogo(): Widget {
        return new WorkbenchNavControlsWidget(this.commandRegistry);
    }
}
