// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { CommandRegistry, DisposableCollection, nls } from '@theia/core/lib/common';
import { ApplicationShell, CommonCommands, Widget } from '@theia/core/lib/browser';
import { Message } from '@theia/core/lib/browser/widgets/widget';
import { collapseLeftPanelIfMobileOneColumn, matchesMobileNarrowViewport } from '@theia/core/lib/browser/shell/mobile-layout-state';
import {
    qaapAuthUserInitials,
    readQaapAuthUser,
    readQaapSignedIn,
} from '@theia/qaap-adapters/lib/browser/qaap-auth-session';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { buildQaapAccountMenuEntries, dismissQaapAccountMenu, toggleQaapAccountMenu } from './qaap-workbench-account-menu';
import { QaapMobileProjectsDashboardCommands } from './mobile-projects-dashboard-commands';
import { MobileProjectsService } from './mobile-projects-service';

const WORKBENCH_NAV_GO_BACK = 'textEditor.commands.go.back';
const WORKBENCH_NAV_GO_FORWARD = 'textEditor.commands.go.forward';
const WORKBENCH_TOGGLE_TERMINAL = 'workbench.action.terminal.toggleTerminal';
const WORKBENCH_AI_CHAT_TOGGLE = 'aiChat:toggle';
const WORKBENCH_CHAT_VIEW_WIDGET_ID = 'chat-view-widget';

function createWorkbenchNavBtn(iconClasses: string, title: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `theia-workbench-nav-btn ${iconClasses}`;
    btn.title = title;
    return btn;
}

function createWorkbenchHistoryNavBtn(iconClasses: string, title: string): HTMLButtonElement {
    const btn = createWorkbenchNavBtn(iconClasses, title);
    btn.classList.add('theia-workbench-history-nav-btn');
    return btn;
}

export class QaapWorkbenchNavControlsWidget extends Widget {
    protected readonly toDispose = new DisposableCollection();
    protected readonly toggleBtn: HTMLButtonElement;
    protected readonly projectNameEl: HTMLSpanElement;

    constructor(
        protected readonly commands: CommandRegistry,
        protected readonly projectsService: MobileProjectsService,
        protected readonly workspaceService: WorkspaceService
    ) {
        const node = document.createElement('motion.div');
        node.classList.add('theia-workbench-nav-controls');
        super({ node });
        this.id = 'theia:workbench-nav';
        this.toggleBtn = createWorkbenchNavBtn(
            'codicon codicon-layout-sidebar-left',
            CommonCommands.TOGGLE_LEFT_PANEL.label ?? 'Toggle Left Panel'
        );
        this.projectNameEl = document.createElement('span');
        this.projectNameEl.className = 'theia-workbench-current-project-name';
        this.projectNameEl.setAttribute('aria-hidden', 'true');
        this.projectNameEl.dataset.branch = '';
        node.append(this.toggleBtn, this.projectNameEl);
        this.toggleBtn.addEventListener('click', this.onToggleClick);
        const refresh = (): void => this.updateEnabledStates();
        this.toDispose.push(this.commands.onDidExecuteCommand(refresh));
        this.toDispose.push(this.commands.onCommandsChanged(refresh));
        this.toDispose.push(this.workspaceService.onWorkspaceChanged(() => this.updateProjectName()));
        this.toDispose.push(this.workspaceService.onWorkspaceLocationChanged(() => this.updateProjectName()));
    }

    protected readonly onToggleClick = (): void => this.runIfEnabled(CommonCommands.TOGGLE_LEFT_PANEL.id);

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.updateEnabledStates();
        this.updateProjectName();
    }

    override dispose(): void {
        if (this.isDisposed) {
            return;
        }
        this.toDispose.dispose();
        this.toggleBtn.removeEventListener('click', this.onToggleClick);
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
    }

    protected updateProjectName(): void {
        const name = this.projectsService.getCurrentWorkspaceDisplayName();
        if (name) {
            this.projectNameEl.textContent = name;
            this.projectNameEl.title = name;
            this.projectNameEl.hidden = false;
            this.updateProjectBranch();
        } else {
            this.projectNameEl.textContent = '';
            this.projectNameEl.title = '';
            this.projectNameEl.dataset.branch = '';
            this.projectNameEl.hidden = true;
        }
    }

    protected updateProjectBranch(): void {
        this.projectNameEl.dataset.branch = this.projectsService.getCurrentWorkspaceBranch() ?? '';
    }
}

/** Editor back / forward; separate top-panel child so mobile CSS can center it in the bar. */
export class QaapWorkbenchHistoryNavWidget extends Widget {
    protected readonly toDispose = new DisposableCollection();
    protected readonly dashboardBtn: HTMLButtonElement;
    protected readonly backBtn: HTMLButtonElement;
    protected readonly forwardBtn: HTMLButtonElement;

    constructor(
        protected readonly commands: CommandRegistry,
        protected readonly workspaceService: WorkspaceService,
    ) {
        const node = document.createElement('motion.div');
        node.classList.add('theia-workbench-history-nav-group');
        super({ node });
        this.id = 'theia:workbench-history-nav';
        this.dashboardBtn = createWorkbenchHistoryNavBtn(
            'codicon codicon-project',
            nls.localize('qaap/mobileProjects/returnToWorkHub', 'Back to Work Hub')
        );
        this.dashboardBtn.classList.add('theia-workbench-dashboard-nav-btn', 'theia-workbench-projects-return-nav-btn');
        this.backBtn = createWorkbenchHistoryNavBtn(
            'codicon codicon-chevron-left',
            nls.localizeByDefault('Go Back')
        );
        this.forwardBtn = createWorkbenchHistoryNavBtn(
            'codicon codicon-chevron-right',
            nls.localizeByDefault('Go Forward')
        );
        node.append(this.dashboardBtn, this.backBtn, this.forwardBtn);
        this.dashboardBtn.addEventListener('click', this.onDashboardClick);
        this.backBtn.addEventListener('click', this.onBackClick);
        this.forwardBtn.addEventListener('click', this.onForwardClick);
        const refresh = (): void => this.updateEnabledStates();
        this.toDispose.push(this.commands.onDidExecuteCommand(refresh));
        this.toDispose.push(this.commands.onCommandsChanged(refresh));
        this.toDispose.push(this.workspaceService.onWorkspaceChanged(refresh));
        this.toDispose.push(this.workspaceService.onWorkspaceLocationChanged(refresh));
    }

    protected readonly onDashboardClick = (): void => this.runIfEnabled(QaapMobileProjectsDashboardCommands.TOGGLE.id);
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
        this.dashboardBtn.removeEventListener('click', this.onDashboardClick);
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

    /** Refresh toggled state after the projects overlay opens or closes outside this widget. */
    refreshChrome(): void {
        this.updateEnabledStates();
    }

    protected updateEnabledStates(): void {
        const narrow = matchesMobileNarrowViewport();
        const showDashboard = narrow && this.workspaceService.opened;
        this.dashboardBtn.hidden = !showDashboard;
        this.dashboardBtn.style.display = showDashboard ? '' : 'none';
        if (showDashboard) {
            this.dashboardBtn.disabled = !this.commands.isEnabled(QaapMobileProjectsDashboardCommands.TOGGLE.id);
            const open = Boolean(
                document.querySelector('.theia-mobile-projects.theia-mod-visible:not(.theia-mod-home)')
            );
            this.dashboardBtn.classList.toggle('theia-mod-toggled', open);
            this.dashboardBtn.setAttribute('aria-pressed', open ? 'true' : 'false');
        }
        this.backBtn.disabled = !this.commands.isEnabled(WORKBENCH_NAV_GO_BACK);
        this.forwardBtn.disabled = !this.commands.isEnabled(WORKBENCH_NAV_GO_FORWARD);
    }
}

export class QaapWorkbenchRightControlsWidget extends Widget {
    protected readonly toDispose = new DisposableCollection();
    protected readonly terminalBtn: HTMLButtonElement;
    protected readonly aiChatBtn: HTMLButtonElement;
    protected readonly accountBtn: HTMLButtonElement;
    protected readonly accountAvatar: HTMLSpanElement;
    protected readonly onAuthSessionChanged = (): void => this.updateAccountVisual();

    constructor(
        protected readonly commands: CommandRegistry,
        protected readonly shell: ApplicationShell
    ) {
        const node = document.createElement('motion.div');
        node.classList.add('theia-workbench-right-controls');
        super({ node });
        this.id = 'theia:workbench-right-controls';
        this.terminalBtn = createWorkbenchNavBtn(
            'codicon codicon-terminal',
            nls.localize('theia/core/workbenchBar/toggleTerminal', 'Toggle Terminal')
        );
        this.terminalBtn.classList.add('theia-workbench-in-mobile-bottom-bar');
        this.terminalBtn.setAttribute('role', 'switch');
        this.aiChatBtn = createWorkbenchNavBtn(
            'codicon codicon-comment-discussion',
            nls.localize('theia/core/workbenchBar/openAiChat', 'Open AI Chat')
        );
        this.aiChatBtn.classList.add('theia-workbench-in-mobile-bottom-bar');
        this.accountBtn = document.createElement('button');
        this.accountBtn.type = 'button';
        this.accountBtn.className = 'theia-workbench-nav-btn theia-workbench-account-btn';
        this.accountBtn.title = nls.localize('qaap/accountMenu/title', 'Account');
        this.accountBtn.setAttribute('aria-haspopup', 'menu');
        this.accountAvatar = document.createElement('span');
        this.accountAvatar.className = 'theia-workbench-account-avatar';
        this.accountAvatar.setAttribute('aria-hidden', 'true');
        this.accountBtn.appendChild(this.accountAvatar);
        node.append(this.terminalBtn, this.aiChatBtn, this.accountBtn);
        this.terminalBtn.addEventListener('click', this.onTerminalClick);
        this.aiChatBtn.addEventListener('click', this.onAiChatClick);
        this.accountBtn.addEventListener('click', this.onAccountClick);
        const refresh = (): void => this.updateEnabledStates();
        this.toDispose.push(this.commands.onDidExecuteCommand(refresh));
        this.toDispose.push(this.commands.onCommandsChanged(refresh));
        this.toDispose.push(this.shell.onDidChangeActiveWidget(refresh));
        this.toDispose.push(this.shell.onDidChangeCurrentWidget(refresh));
        this.toDispose.push(this.shell.onDidAddWidget(refresh));
        this.toDispose.push(this.shell.onDidRemoveWidget(refresh));
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
    protected readonly onAccountClick = (): void => {
        const signedIn = readQaapSignedIn();
        toggleQaapAccountMenu(this.accountBtn, this.commands, buildQaapAccountMenuEntries(signedIn));
    };

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        window.addEventListener('qaap-auth-session-changed', this.onAuthSessionChanged);
        this.updateEnabledStates();
        this.updateAccountVisual();
    }

    protected override onBeforeDetach(msg: Message): void {
        dismissQaapAccountMenu();
        window.removeEventListener('qaap-auth-session-changed', this.onAuthSessionChanged);
        super.onBeforeDetach(msg);
    }

    override dispose(): void {
        if (this.isDisposed) {
            return;
        }
        this.toDispose.dispose();
        dismissQaapAccountMenu();
        window.removeEventListener('qaap-auth-session-changed', this.onAuthSessionChanged);
        this.terminalBtn.removeEventListener('click', this.onTerminalClick);
        this.aiChatBtn.removeEventListener('click', this.onAiChatClick);
        this.accountBtn.removeEventListener('click', this.onAccountClick);
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
        this.updateTerminalSwitchVisual();
        this.updateAiChatSwitchVisual();
        this.updateAccountVisual();
    }

    protected updateAccountVisual(): void {
        this.accountBtn.hidden = false;
        this.accountBtn.style.display = '';
        const signedIn = readQaapSignedIn();
        if (!signedIn) {
            this.accountAvatar.replaceChildren();
            const icon = document.createElement('span');
            icon.className = 'codicon codicon-account theia-workbench-account-fallback-icon';
            icon.setAttribute('aria-hidden', 'true');
            this.accountAvatar.appendChild(icon);
            this.accountBtn.title = nls.localize('qaap/accountMenu/signInGithub', 'Sign in with GitHub');
            return;
        }
        const user = readQaapAuthUser();
        this.accountAvatar.replaceChildren();
        if (!user) {
            const icon = document.createElement('span');
            icon.className = 'codicon codicon-account theia-workbench-account-fallback-icon';
            icon.setAttribute('aria-hidden', 'true');
            this.accountAvatar.appendChild(icon);
            this.accountBtn.title = nls.localize('qaap/accountMenu/title', 'Account');
            return;
        }
        this.accountBtn.title = user.name || user.login;
        if (user.avatarUrl) {
            const img = document.createElement('img');
            img.src = user.avatarUrl;
            img.alt = '';
            img.draggable = false;
            img.referrerPolicy = 'no-referrer';
            this.accountAvatar.appendChild(img);
            return;
        }
        const initials = document.createElement('span');
        initials.className = 'theia-workbench-account-initials';
        initials.textContent = qaapAuthUserInitials(user);
        this.accountAvatar.appendChild(initials);
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
