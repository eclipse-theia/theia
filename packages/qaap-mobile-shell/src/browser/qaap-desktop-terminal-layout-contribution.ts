// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { PreferenceService } from '@theia/core/lib/common/preferences';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { FrontendApplication } from '@theia/core/lib/browser/frontend-application';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { animationFrame, ApplicationShell, MAXIMIZED_CLASS } from '@theia/core/lib/browser';
import {
    matchesMobileNarrowViewport,
    MOBILE_NARROW_VIEWPORT_MEDIA_QUERY,
} from '@theia/core/lib/browser/shell/mobile-layout-state';
import { TerminalCommands } from '@theia/terminal/lib/browser/terminal-frontend-contribution';

/** Same command as the bottom-panel chevron-up toolbar button in terminal-manager. */
const MAXIMIZE_BOTTOM_PANEL_COMMAND = 'terminal:manager-maximize-bottom-panel';

/**
 * Desktop default: show the terminal and maximize the bottom panel (same as clicking
 * "Maximize Bottom Panel" in the terminal toolbar).
 */
@injectable()
export class QaapDesktopTerminalLayoutContribution implements FrontendApplicationContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(FrontendApplicationStateService)
    protected readonly stateService: FrontendApplicationStateService;

    protected readonly mobileMq = typeof window !== 'undefined'
        ? window.matchMedia(MOBILE_NARROW_VIEWPORT_MEDIA_QUERY)
        : undefined;

    protected ensureScheduled = false;

    onStart(): void {
        this.mobileMq?.addEventListener('change', this.onViewportChange);
        this.shell.onDidAddWidget(widget => {
            if (!matchesMobileNarrowViewport() && this.shell.getAreaFor(widget) === 'bottom') {
                this.scheduleEnsureDesktopTerminal();
            }
        });
    }

    onStop(): void {
        this.mobileMq?.removeEventListener('change', this.onViewportChange);
    }

    onDidInitializeLayout(_app: FrontendApplication): void {
        void this.stateService.reachedState('ready').then(() => this.scheduleEnsureDesktopTerminal());
    }

    protected readonly onViewportChange = (): void => {
        if (!matchesMobileNarrowViewport()) {
            this.scheduleEnsureDesktopTerminal();
        }
    };

    protected scheduleEnsureDesktopTerminal(): void {
        if (matchesMobileNarrowViewport() || this.ensureScheduled) {
            return;
        }
        this.ensureScheduled = true;
        void this.runEnsureDesktopTerminal().finally(() => {
            this.ensureScheduled = false;
        });
    }

    protected async runEnsureDesktopTerminal(): Promise<void> {
        if (matchesMobileNarrowViewport()) {
            return;
        }
        await this.stateService.reachedState('ready');
        await this.shell.pendingUpdates;
        await animationFrame();
        await this.ensureDesktopTerminalMaximized();
    }

    /** Called from {@link MobileOneColumnShellContribution.ensureDesktopSidePanelSizes} after split restore. */
    async ensureDesktopTerminalMaximized(): Promise<void> {
        if (matchesMobileNarrowViewport()) {
            return;
        }
        await this.preferenceService.ready;
        await this.ensureBottomTerminalVisible();
        if (this.shell.bottomPanel.isEmpty || !this.shell.isExpanded('bottom')) {
            return;
        }
        await this.getBottomPanelPendingUpdate();
        await animationFrame();

        const bottomPanel = this.shell.bottomPanel;
        if (!this.shell.isExpanded('bottom') || bottomPanel.hasClass(MAXIMIZED_CLASS)) {
            return;
        }

        const bottomWidgets = this.shell.getWidgets('bottom');
        const bottomWidget = bottomWidgets.length > 0 ? bottomWidgets[0] : undefined;
        if (bottomWidget) {
            this.shell.activateWidget(bottomWidget.id);
            await animationFrame();
        }

        if (this.commands.getCommand(MAXIMIZE_BOTTOM_PANEL_COMMAND)) {
            try {
                await this.commands.executeCommand(MAXIMIZE_BOTTOM_PANEL_COMMAND);
            } catch (error) {
                console.error('[qaap-mobile-shell] failed to maximize desktop bottom panel', error);
            }
            return;
        }
        bottomPanel.toggleMaximized();
    }

    protected async ensureBottomTerminalVisible(): Promise<void> {
        if (!this.shell.bottomPanel.isEmpty) {
            if (!this.shell.isExpanded('bottom')) {
                this.shell.expandPanel('bottom');
            }
            return;
        }
        await this.openDefaultTerminal();
        if (!this.shell.bottomPanel.isEmpty && !this.shell.isExpanded('bottom')) {
            this.shell.expandPanel('bottom');
        }
    }

    protected async openDefaultTerminal(): Promise<void> {
        const groupingMode = this.preferenceService.get('terminal.grouping.mode');
        const commandId = groupingMode === 'tree'
            ? TerminalCommands.TOGGLE_TERMINAL.id
            : TerminalCommands.NEW.id;
        if (!this.commands.getCommand(commandId) || !this.commands.isEnabled(commandId)) {
            return;
        }
        try {
            await this.commands.executeCommand(commandId);
        } catch (error) {
            console.error('[qaap-mobile-shell] failed to open default desktop terminal', error);
        }
    }

    protected getBottomPanelPendingUpdate(): Promise<void> {
        const state = (this.shell as ApplicationShell & { bottomPanelState?: { pendingUpdate: Promise<void> } }).bottomPanelState;
        return state?.pendingUpdate ?? Promise.resolve();
    }
}
