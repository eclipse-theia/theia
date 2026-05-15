// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { CommandRegistry, DisposableCollection, nls } from '@theia/core/lib/common';
import { ApplicationShell, CommonCommands, Widget } from '@theia/core/lib/browser';
import { Message } from '@theia/core/lib/browser/widgets/widget';
import { collapseLeftPanelIfMobileOneColumn, matchesMobileNarrowViewport } from '@theia/core/lib/browser/shell/mobile-layout-state';

const WORKBENCH_NAV_GO_BACK = 'textEditor.commands.go.back';
const WORKBENCH_NAV_GO_FORWARD = 'textEditor.commands.go.forward';
const WORKBENCH_TOGGLE_TERMINAL = 'workbench.action.terminal.toggleTerminal';
const WORKBENCH_AI_CHAT_TOGGLE = 'aiChat:toggle';
const WORKBENCH_CHAT_VIEW_WIDGET_ID = 'chat-view-widget';

export class QaapWorkbenchNavControlsWidget extends Widget {
    protected readonly toDispose = new DisposableCollection();
    protected readonly toggleBtn: HTMLButtonElement;
    protected readonly backBtn: HTMLButtonElement;
    protected readonly forwardBtn: HTMLButtonElement;

    constructor(protected readonly commands: CommandRegistry) {
        const node = document.createElement('div');
        node.classList.add('theia-workbench-nav-controls');
        super({ node });
        this.id = 'theia:workbench-nav';
        this.toggleBtn = QaapWorkbenchNavControlsWidget.createBtn(
            'codicon codicon-layout-sidebar-left',
            CommonCommands.TOGGLE_LEFT_PANEL.label ?? 'Toggle Left Panel'
        );
        this.backBtn = QaapWorkbenchNavControlsWidget.createBtn(
            'codicon codicon-arrow-left',
            nls.localizeByDefault('Go Back')
        );
        this.forwardBtn = QaapWorkbenchNavControlsWidget.createBtn(
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

export class QaapWorkbenchRightControlsWidget extends Widget {
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
        this.terminalBtn = QaapWorkbenchRightControlsWidget.createBtn(
            'codicon codicon-terminal',
            nls.localize('theia/core/workbenchBar/toggleTerminal', 'Toggle Terminal')
        );
        this.terminalBtn.setAttribute('role', 'switch');
        this.aiChatBtn = QaapWorkbenchRightControlsWidget.createBtn(
            'codicon codicon-comment-discussion',
            nls.localize('theia/core/workbenchBar/openAiChat', 'Open AI Chat')
        );
        this.settingsBtn = QaapWorkbenchRightControlsWidget.createBtn(
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
        if (matchesMobileNarrowViewport()) {
            collapseLeftPanelIfMobileOneColumn(this.shell);
        }
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

    protected updateAiChatSwitchVisual(): void {
        const narrow = matchesMobileNarrowViewport();
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
