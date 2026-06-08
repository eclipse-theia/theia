// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable } from '@theia/core/lib/common/disposable';
import { nls } from '@theia/core/lib/common/nls';
import {
    type QaapAgentConversationDTO,
    type QaapAgentConversationSummaryDTO,
} from '../common/qaap-agent-conversation-client';
import {
    type ExecutionSurfaceTabId,
    recordExecutionSurfaceTabUse,
} from '../common/qaap-execution-surface-tabs';
import {
    appendExecutionSurfaceTabIcon,
    createExecutionSurfaceIconElement,
    QAAP_SCM_CHANGES_ICON_CLASS,
} from '../common/qaap-scm-changes-icon';
import { applyExecutionSurfaceHeaderChrome } from './qaap-execution-surface-header-chrome';
import type { MobileProjectEntry } from './mobile-projects-types';

type TranscriptTab = ExecutionSurfaceTabId;

/** Panel surface for execution-surface tab strips, overflow menu, and tab navigation. */
export interface MobileProjectsExecutionSurfaceTabsHost {
    readonly executionSurfaceTabByProjectId: Map<string, TranscriptTab>;
    transcriptTabStrip: HTMLElement | undefined;
    transcriptSheet: HTMLElement | undefined;
    transcriptChatHost: HTMLElement | undefined;
    transcriptChatInputHost: HTMLElement | undefined;
    transcriptPlanHost: HTMLElement | undefined;
    transcriptReviewHost: HTMLElement | undefined;
    transcriptPreviewHost: HTMLElement | undefined;
    transcriptFilesHost: HTMLElement | undefined;
    transcriptTerminalHost: HTMLElement | undefined;
    transcriptHeaderSubtitle: HTMLElement | undefined;
    transcriptOpenSummary: QaapAgentConversationSummaryDTO | undefined;
    transcriptOpenProject: MobileProjectEntry | undefined;
    transcriptLastConv: QaapAgentConversationDTO | undefined;
    projectDetailTabStrip: HTMLElement | undefined;
    projectDetailSurfaceTargets: {
        chatHost: HTMLElement;
        planHost: HTMLElement;
        reviewHost: HTMLElement;
        previewHost: HTMLElement;
        filesHost: HTMLElement;
        terminalHost: HTMLElement;
    } | undefined;
    headerExecutionTabsHost: HTMLElement;
    headerExecutionTabsProjectId: string | undefined;
    agentsHubShellActive: boolean;
    agentsHubInlineTranscriptRoot: HTMLElement | undefined;
    agentsHubInlineExecutionRoot: HTMLElement | undefined;
    agentsHubInlineTabStrip: HTMLElement | undefined;
    stickyComposerHost: HTMLElement;
    root: HTMLElement;
    scroll: HTMLElement;
    executionTabOverflowMenu: HTMLElement | undefined;
    executionTabOverflowAnchor: HTMLButtonElement | undefined;
    executionTabOverflowDispose: Disposable;
    expandedId: string | undefined;
    projectDetailExpandedId: string | undefined;

    appendTranscriptHeaderActions(header: HTMLElement, title: HTMLElement): HTMLButtonElement;
    createExecutionHeaderSubtitle(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): HTMLElement;
    updateTranscriptHeader(project: MobileProjectEntry, summary?: QaapAgentConversationSummaryDTO): void;
    renderHeader(): void;
    renderSubtitle(): void;
    renderStickyComposer(): void;
    selectProjectDetailTab(tab: TranscriptTab, project: MobileProjectEntry): void;
    mountProjectDetailSurfaceTab(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        tab: TranscriptTab,
    ): void;
    renderPlanTab(host: HTMLElement | undefined, conv: QaapAgentConversationDTO | undefined): void;
    mountTranscriptReviewWidget(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void>;
    renderPreviewTab(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): void;
    ensureTranscriptFilesTab(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): void;
    ensureTranscriptTerminalTab(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): Promise<void>;
    resolveAgentsHubShellSummary(project: MobileProjectEntry): QaapAgentConversationSummaryDTO;
    resolveSelectedProject(): MobileProjectEntry | undefined;
    isProjectDetailView(): boolean;
    projects: MobileProjectEntry[];
    projectsForCurrentHubList(): MobileProjectEntry[];
    closeCardMenu(): void;
}

/** Tab strip, overflow picker, and execution-surface visibility for transcript and project detail. */
export class MobileProjectsExecutionSurfaceTabsUi {

    constructor(protected readonly host: MobileProjectsExecutionSurfaceTabsHost) { }

    resolveExecutionSurfaceProject(): MobileProjectEntry | undefined {
        const projectId = this.host.projectDetailExpandedId ?? this.host.expandedId;
        if (!projectId) {
            return undefined;
        }
        return this.host.projects.find(p => p.id === projectId)
            ?? this.host.projectsForCurrentHubList().find(p => p.id === projectId);
    }

    activeExecutionTab(project?: MobileProjectEntry): TranscriptTab {
        const resolved = project ?? this.resolveExecutionSurfaceProject();
        return resolved ? this.executionSurfaceTabForProject(resolved) : 'messages';
    }

    executionSurfaceTabForProject(project: MobileProjectEntry): TranscriptTab {
        return this.host.executionSurfaceTabByProjectId.get(project.id) ?? 'messages';
    }

    setExecutionSurfaceTab(project: MobileProjectEntry, tab: TranscriptTab): void {
        this.host.executionSurfaceTabByProjectId.set(project.id, tab);
        this.syncExecutionSurfaceChrome(project);
    }

    /** Keep Chat vs overflow-select styling in sync on every connected header strip. */
    syncExecutionSurfaceChrome(project: MobileProjectEntry): void {
        const tab = this.executionSurfaceTabForProject(project);
        this.syncExecutionSurfaceChromeInHost(this.host.headerExecutionTabsHost, tab, linked => {
            this.host.projectDetailTabStrip = linked;
        });
        if (this.host.transcriptSheet?.isConnected) {
            this.syncExecutionSurfaceChromeInHost(this.host.transcriptSheet, tab, linked => {
                this.host.transcriptTabStrip = linked;
            });
        } else if (this.host.transcriptTabStrip?.isConnected) {
            this.refreshExecutionSurfaceTabStripState(this.host.transcriptTabStrip, tab);
        }
    }

    syncExecutionSurfaceChromeInHost(
        host: HTMLElement,
        tab: TranscriptTab,
        linkStrip: (strip: HTMLElement) => void,
    ): void {
        const strips = host.querySelectorAll<HTMLElement>('.theia-mobile-transcript-tabs.theia-mod-header-inline');
        if (strips.length === 0) {
            return;
        }
        strips.forEach(strip => this.refreshExecutionSurfaceTabStripState(strip, tab));
        linkStrip(strips[strips.length - 1]!);
    }

    resolveExecutionSurfaceTabStripHost(strip: HTMLElement | undefined): HTMLElement | undefined {
        if (!strip) {
            return undefined;
        }
        const host = strip.closest('.theia-mobile-projects-header-execution-tabs');
        return host instanceof HTMLElement ? host : strip.parentElement ?? undefined;
    }

    /** Same host wrapper as project-detail (task) header — keeps tab chrome CSS identical. */
    appendExecutionSurfaceTabStripToTitleRow(titleRow: HTMLElement, strip: HTMLElement): void {
        const host = document.createElement('div');
        host.className = 'theia-mobile-projects-header-execution-tabs';
        host.append(strip);
        titleRow.append(host);
    }

    mountTranscriptExecutionHeader(
        header: HTMLElement,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        titleText: string,
    ): { back: HTMLButtonElement; tabStrip: HTMLElement } {
        header.classList.add('theia-mod-execution-tabs');
        const title = document.createElement('h2');
        title.textContent = titleText;
        const back = this.host.appendTranscriptHeaderActions(header, title);
        const subtitle = this.host.createExecutionHeaderSubtitle(project, summary);
        header.querySelector('.theia-mobile-agent-log-title-wrap')?.append(subtitle);
        this.host.transcriptHeaderSubtitle = subtitle;
        this.setExecutionSurfaceTab(project, 'messages');
        this.host.updateTranscriptHeader(project, summary);
        const activeTab = this.executionSurfaceTabForProject(project);
        const tabStrip = this.buildTranscriptTabStrip(project, summary);
        const titleRow = header.querySelector('.theia-mobile-agent-log-title-row');
        if (titleRow instanceof HTMLElement) {
            this.appendExecutionSurfaceTabStripToTitleRow(titleRow, tabStrip);
        }
        this.refreshExecutionSurfaceTabStripState(tabStrip, activeTab);
        return { back, tabStrip };
    }

    replaceExecutionSurfaceTabStrip(currentStrip: HTMLElement | undefined, nextStrip: HTMLElement): void {
        const host = this.resolveExecutionSurfaceTabStripHost(currentStrip);
        if (host) {
            host.replaceChildren(nextStrip);
            return;
        }
        currentStrip?.replaceWith(nextStrip);
    }

    selectTranscriptTab(tab: TranscriptTab, project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): void {
        this.activateExecutionSurfaceTab(tab, project, summary, 'transcript');
    }

    activateExecutionSurfaceTab(
        tab: TranscriptTab,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        origin: 'transcript' | 'project-detail',
    ): void {
        const sameTab = this.executionSurfaceTabForProject(project) === tab;
        if (sameTab) {
            this.syncExecutionSurfaceChrome(project);
            if (tab === 'messages') {
                this.closeExecutionTabOverflowMenu();
            }
        } else {
            recordExecutionSurfaceTabUse(tab);
            this.setExecutionSurfaceTab(project, tab);
            this.rebuildExecutionSurfaceTabStrips(project, tab);
            if (origin === 'transcript') {
                this.host.updateTranscriptHeader(project);
            } else {
                this.host.renderHeader();
                this.host.renderSubtitle();
            }
        }
        this.showOnlyExecutionSurfaceTab(tab);
        this.mountExecutionSurfaceTabContent(project, summary, tab);
        this.host.root.classList.toggle('theia-mod-project-surface-chat', tab === 'messages');
        this.host.root.classList.toggle('theia-mod-project-surface-tools', tab !== 'messages');
        this.host.renderStickyComposer();
        this.syncExecutionSurfaceChrome(project);
    }

    /** Hide all execution surfaces; reveal exactly one tab. */
    showOnlyExecutionSurfaceTab(tab: TranscriptTab): void {
        const showMessages = tab === 'messages';
        if (this.host.agentsHubInlineTranscriptRoot) {
            this.host.agentsHubInlineTranscriptRoot.hidden = !showMessages;
        }
        if (this.host.transcriptChatHost) {
            this.host.transcriptChatHost.hidden = !showMessages;
        }
        if (this.host.transcriptChatInputHost) {
            this.host.transcriptChatInputHost.hidden = !showMessages;
        }
        if (this.host.transcriptPlanHost) {
            this.host.transcriptPlanHost.hidden = tab !== 'plan';
        }
        if (this.host.transcriptReviewHost) {
            this.host.transcriptReviewHost.hidden = tab !== 'review';
        }
        if (this.host.transcriptPreviewHost) {
            this.host.transcriptPreviewHost.hidden = tab !== 'preview';
        }
        if (this.host.transcriptFilesHost) {
            this.host.transcriptFilesHost.hidden = tab !== 'files';
        }
        if (this.host.transcriptTerminalHost) {
            this.host.transcriptTerminalHost.hidden = tab !== 'terminal';
        }
        const targets = this.host.projectDetailSurfaceTargets;
        if (targets) {
            targets.chatHost.hidden = !showMessages;
            targets.planHost.hidden = tab !== 'plan';
            targets.reviewHost.hidden = tab !== 'review';
            targets.previewHost.hidden = tab !== 'preview';
            targets.filesHost.hidden = tab !== 'files';
            targets.terminalHost.hidden = tab !== 'terminal';
        }
        if (this.host.agentsHubShellActive) {
            this.host.stickyComposerHost.hidden = !showMessages;
            this.host.root.classList.toggle('theia-mod-sticky-composer', showMessages);
        }
        this.host.agentsHubInlineExecutionRoot?.setAttribute('data-active-surface', tab);
        this.host.transcriptSheet?.querySelector('.theia-mobile-agent-log-sheet')?.setAttribute('data-active-surface', tab);
        this.host.root.querySelector('.theia-mobile-projects-detail-surfaces-body')?.setAttribute('data-active-surface', tab);
    }

    mountExecutionSurfaceTabContent(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        tab: TranscriptTab,
    ): void {
        if (this.host.transcriptSheet || this.host.agentsHubShellActive) {
            this.mountTranscriptSurfaceTab(project, summary, tab);
            return;
        }
        this.host.mountProjectDetailSurfaceTab(project, summary, tab);
    }

    syncHeaderExecutionTabStrip(): void {
        if (this.host.agentsHubShellActive) {
            return;
        }
        const project = this.host.isProjectDetailView() ? this.host.resolveSelectedProject() : undefined;
        if (!project) {
            this.host.headerExecutionTabsHost.hidden = true;
            this.host.headerExecutionTabsHost.replaceChildren();
            this.host.projectDetailTabStrip = undefined;
            this.host.headerExecutionTabsProjectId = undefined;
            return;
        }
        this.host.headerExecutionTabsHost.hidden = false;
        const activeTab = this.executionSurfaceTabForProject(project);
        const needsRebuild = this.host.headerExecutionTabsProjectId !== project.id
            || !this.host.projectDetailTabStrip
            || !this.host.headerExecutionTabsHost.contains(this.host.projectDetailTabStrip);
        if (needsRebuild) {
            this.host.headerExecutionTabsProjectId = project.id;
            const tabStrip = this.buildExecutionViewTabStrip(
                activeTab,
                tab => this.host.selectProjectDetailTab(tab, project),
            );
            this.host.headerExecutionTabsHost.replaceChildren(tabStrip);
            this.host.projectDetailTabStrip = tabStrip;
            applyExecutionSurfaceHeaderChrome(tabStrip, activeTab);
            this.applyExecutionSurfaceIconSelectDisplay(tabStrip, activeTab);
            return;
        }
        this.syncProjectDetailTabStrip();
    }

    syncProjectDetailTabStrip(): void {
        const project = this.resolveExecutionSurfaceProject();
        if (!project) {
            return;
        }
        this.syncExecutionSurfaceChrome(project);
    }

    syncTranscriptTabStrip(project: MobileProjectEntry): void {
        if (!this.host.transcriptTabStrip) {
            return;
        }
        this.refreshExecutionSurfaceTabStripState(this.host.transcriptTabStrip, this.executionSurfaceTabForProject(project));
    }

    rebuildExecutionSurfaceTabStrips(project: MobileProjectEntry, activeTab: TranscriptTab): void {
        this.closeExecutionTabOverflowMenu();
        const summary = this.host.transcriptOpenSummary ?? this.host.resolveAgentsHubShellSummary(project);
        if (this.host.agentsHubShellActive && !this.host.headerExecutionTabsHost.hidden) {
            const strip = this.buildExecutionViewTabStrip(
                activeTab,
                tab => this.selectTranscriptTab(tab, project, summary),
            );
            this.host.headerExecutionTabsHost.replaceChildren(strip);
            this.host.transcriptTabStrip = strip;
            this.host.agentsHubInlineTabStrip = strip;
            this.refreshExecutionSurfaceTabStripState(strip, activeTab);
        } else if (this.host.projectDetailTabStrip && this.host.headerExecutionTabsHost.contains(this.host.projectDetailTabStrip)) {
            const strip = this.buildExecutionViewTabStrip(
                activeTab,
                tab => this.host.selectProjectDetailTab(tab, project),
            );
            this.host.headerExecutionTabsHost.replaceChildren(strip);
            this.host.projectDetailTabStrip = strip;
            this.refreshExecutionSurfaceTabStripState(strip, activeTab);
        }
        if (this.host.transcriptTabStrip?.isConnected
            && this.host.transcriptOpenSummary
            && this.host.transcriptTabStrip !== this.host.agentsHubInlineTabStrip) {
            const strip = this.buildExecutionViewTabStrip(
                activeTab,
                tab => this.selectTranscriptTab(tab, project, summary),
            );
            this.replaceExecutionSurfaceTabStrip(this.host.transcriptTabStrip, strip);
            this.host.transcriptTabStrip = strip;
            this.refreshExecutionSurfaceTabStripState(strip, activeTab);
        }
    }

    /** Transcript + task headers share {@link applyExecutionSurfaceHeaderChrome}. */
    refreshExecutionSurfaceTabStripState(strip: HTMLElement, activeTab: TranscriptTab): void {
        if (activeTab === 'messages') {
            this.closeExecutionTabOverflowMenu();
        }
        applyExecutionSurfaceHeaderChrome(strip, activeTab);
        const selectBtn = strip.querySelector<HTMLButtonElement>('.theia-mobile-transcript-tab-icon-select');
        selectBtn?.setAttribute('aria-expanded', 'false');
        this.applyExecutionSurfaceIconSelectDisplay(strip, activeTab);
    }

    resolveExecutionSurfaceIconSelectDisplayTab(activeTab: TranscriptTab): TranscriptTab {
        return activeTab;
    }

    navigateExecutionSurfaceBack(project: MobileProjectEntry): boolean {
        if (this.executionSurfaceTabForProject(project) === 'messages') {
            return false;
        }
        const agentsSummary = this.host.transcriptOpenSummary
            ?? (this.host.agentsHubShellActive ? this.host.resolveAgentsHubShellSummary(project) : undefined);
        if ((this.host.transcriptSheet || this.host.agentsHubShellActive) && agentsSummary) {
            this.selectTranscriptTab('messages', project, agentsSummary);
            return true;
        }
        if (this.host.isProjectDetailView() && this.host.expandedId === project.id) {
            this.host.selectProjectDetailTab('messages', project);
            return true;
        }
        return false;
    }

    applyExecutionSurfaceIconSelectDisplay(strip: HTMLElement, activeTab: TranscriptTab): void {
        const selectBtn = strip.querySelector<HTMLButtonElement>('.theia-mobile-transcript-tab-icon-select');
        const symbol = strip.querySelector<HTMLElement>('.theia-mobile-transcript-tab-icon-select-symbol');
        if (!selectBtn || !symbol) {
            return;
        }
        const displayTabId = this.resolveExecutionSurfaceIconSelectDisplayTab(activeTab);
        const spec = this.executionSurfaceTabSpecs().find(entry => entry.id === displayTabId);
        if (!spec) {
            return;
        }
        selectBtn.dataset.tab = spec.id;
        selectBtn.title = spec.label;
        selectBtn.setAttribute('aria-label', `${spec.label}, ${nls.localize('qaap/mobileProjects/tabOverflow', 'Change view')}`);
        symbol.replaceWith(createExecutionSurfaceIconElement(spec.icon, 'theia-mobile-transcript-tab-icon-select-symbol'));
        const triggerLabel = strip.querySelector<HTMLElement>('.theia-mobile-transcript-tab-icon-select-label');
        if (triggerLabel) {
            triggerLabel.textContent = spec.label;
        }
        for (const item of Array.from(strip.querySelectorAll<HTMLButtonElement>('.theia-mobile-transcript-tab-icon-select-option'))) {
            const tabId = item.dataset.tab as TranscriptTab | undefined;
            item.classList.toggle('theia-mod-active', tabId === activeTab);
        }
    }

    buildTranscriptTabStrip(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): HTMLElement {
        return this.buildExecutionViewTabStrip(
            this.executionSurfaceTabForProject(project),
            tab => this.selectTranscriptTab(tab, project, summary),
        );
    }

    buildExecutionViewTabStrip(
        activeTab: TranscriptTab,
        onSelect: (tab: TranscriptTab) => void,
    ): HTMLElement {
        const strip = document.createElement('div');
        strip.className = 'theia-mobile-transcript-tabs theia-mod-header-inline';
        strip.setAttribute('role', 'tablist');
        const tabSpecs = this.executionSurfaceTabSpecs();
        const selectTab = (tab: TranscriptTab): void => {
            this.closeExecutionTabOverflowMenu();
            onSelect(tab);
        };
        const displayTabId = this.resolveExecutionSurfaceIconSelectDisplayTab(activeTab);
        strip.append(this.createExecutionSurfaceIconSelect(
            displayTabId,
            activeTab,
            tabSpecs,
            selectTab,
        ));
        applyExecutionSurfaceHeaderChrome(strip, activeTab);
        return strip;
    }

    executionSurfaceTabSpecs(): Array<{ id: TranscriptTab; label: string; icon: string }> {
        return [
            { id: 'messages', label: nls.localize('qaap/mobileProjects/tabChat', 'Chat'), icon: 'codicon-comment-discussion' },
            { id: 'plan', label: nls.localize('qaap/mobileProjects/tabPlan', 'Plan'), icon: 'codicon-file-text' },
            { id: 'review', label: nls.localize('qaap/mobileProjects/tabChanges', 'Changes'), icon: QAAP_SCM_CHANGES_ICON_CLASS },
            { id: 'preview', label: nls.localize('qaap/mobileProjects/tabPreview', 'Preview'), icon: 'codicon-globe' },
            { id: 'files', label: nls.localize('qaap/mobileProjects/tabFiles', 'Files'), icon: 'codicon-folder-opened' },
            { id: 'terminal', label: nls.localize('qaap/mobileProjects/tabTerminal', 'Terminal'), icon: 'codicon-terminal' },
        ];
    }

    createExecutionSurfaceIconSelect(
        displayTabId: TranscriptTab,
        activeTab: TranscriptTab,
        tabSpecs: Array<{ id: TranscriptTab; label: string; icon: string }>,
        onSelect: (tab: TranscriptTab) => void,
    ): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'theia-mobile-transcript-tab-icon-select-host';

        const displaySpec = tabSpecs.find(entry => entry.id === displayTabId) ?? tabSpecs[0];
        const menuLabel = nls.localize('qaap/mobileProjects/tabOverflow', 'Change view');
        const menuOptions = this.executionSurfaceTabSpecs();

        const menu = document.createElement('div');
        menu.className = 'theia-mobile-transcript-tab-icon-select-menu';
        menu.hidden = true;
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', menuLabel);

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'theia-mobile-transcript-tab-icon-select';
        trigger.dataset.tab = displaySpec.id;
        trigger.setAttribute('role', 'button');
        trigger.setAttribute('aria-haspopup', 'menu');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.classList.remove('theia-mod-active');
        trigger.classList.add('theia-mod-selected');
        trigger.dataset.surfaceActive = 'true';
        trigger.setAttribute('aria-selected', 'true');
        trigger.title = displaySpec.label;
        trigger.setAttribute('aria-label', menuLabel);

        appendExecutionSurfaceTabIcon(trigger, displaySpec.icon, 'theia-mobile-transcript-tab-icon-select-symbol');
        const triggerLabel = document.createElement('span');
        triggerLabel.className = 'theia-mobile-transcript-tab-icon-select-label';
        triggerLabel.textContent = displaySpec.label;
        triggerLabel.setAttribute('aria-hidden', 'true');
        const chevron = document.createElement('span');
        chevron.className = 'theia-mobile-transcript-tab-icon-select-chevron codicon codicon-chevron-down';
        chevron.setAttribute('aria-hidden', 'true');
        trigger.append(triggerLabel, chevron);
        trigger.addEventListener('click', event => {
            event.stopPropagation();
            if (this.host.executionTabOverflowMenu?.classList.contains('theia-mod-open')) {
                this.closeExecutionTabOverflowMenu();
                return;
            }
            this.openExecutionTabOverflowMenu(trigger, menu);
        });

        for (const spec of menuOptions) {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'theia-mobile-transcript-tab-icon-select-option';
            item.dataset.tab = spec.id;
            item.setAttribute('role', 'menuitem');
            item.classList.toggle('theia-mod-active', spec.id === activeTab);
            item.title = spec.label;
            item.setAttribute('aria-label', spec.label);
            appendExecutionSurfaceTabIcon(item, spec.icon, '');
            const itemLabel = document.createElement('span');
            itemLabel.textContent = spec.label;
            item.append(itemLabel);
            item.addEventListener('click', event => {
                event.stopPropagation();
                this.closeExecutionTabOverflowMenu();
                onSelect(spec.id);
            });
            menu.append(item);
        }

        wrap.append(trigger, menu);
        return wrap;
    }

    resolveExecutionTabOverflowMenuPortal(anchor: HTMLElement): HTMLElement {
        const transcriptRoot = anchor.closest('.theia-mobile-agent-transcript-root');
        if (transcriptRoot instanceof HTMLElement) {
            return transcriptRoot;
        }
        return this.host.root;
    }

    openExecutionTabOverflowMenu(anchor: HTMLButtonElement, menu: HTMLElement): void {
        this.closeExecutionTabOverflowMenu();
        this.host.closeCardMenu();
        this.host.executionTabOverflowAnchor = anchor;
        this.host.executionTabOverflowMenu = menu;
        anchor.setAttribute('aria-expanded', 'true');
        menu.hidden = false;
        menu.classList.add('theia-mod-open', 'theia-mod-floating');
        this.resolveExecutionTabOverflowMenuPortal(anchor).append(menu);
        window.requestAnimationFrame(() => {
            if (this.host.executionTabOverflowMenu === menu && this.host.executionTabOverflowAnchor === anchor) {
                this.positionExecutionTabOverflowMenu(menu, anchor);
            }
        });
        const onDismiss = (event: Event): void => {
            const target = event.target;
            if (target instanceof Node && (menu.contains(target) || anchor.contains(target))) {
                return;
            }
            this.closeExecutionTabOverflowMenu();
        };
        const onReposition = (): void => {
            if (this.host.executionTabOverflowMenu === menu && this.host.executionTabOverflowAnchor === anchor) {
                this.positionExecutionTabOverflowMenu(menu, anchor);
            }
        };
        window.setTimeout(() => {
            window.addEventListener('pointerdown', onDismiss, true);
        }, 0);
        window.addEventListener('resize', onReposition);
        this.host.scroll.addEventListener('scroll', onReposition, { passive: true });
        this.host.executionTabOverflowDispose = Disposable.create(() => {
            window.removeEventListener('pointerdown', onDismiss, true);
            window.removeEventListener('resize', onReposition);
            this.host.scroll.removeEventListener('scroll', onReposition);
        });
    }

    executionTabOverflowMenuMinTop(anchor: HTMLElement): number {
        const gap = 6;
        const titleRow = anchor.closest('.theia-mobile-transcript-tabs')
            ?.closest('.theia-mobile-projects-title-row, .theia-mobile-agent-log-title-row');
        if (titleRow) {
            return titleRow.getBoundingClientRect().bottom + gap;
        }
        const header = anchor.closest('.theia-mobile-agent-log-header, .theia-mobile-projects-header');
        if (header) {
            return header.getBoundingClientRect().bottom + gap;
        }
        return anchor.getBoundingClientRect().bottom + gap;
    }

    positionExecutionTabOverflowMenu(menu: HTMLElement, anchor: HTMLElement): void {
        const margin = 8;
        const gap = 6;
        const anchorRect = anchor.getBoundingClientRect();
        const menuWidth = Math.max(menu.offsetWidth || menu.scrollWidth, 188);
        const menuHeight = Math.max(menu.offsetHeight || menu.scrollHeight, 1);
        const minTop = this.executionTabOverflowMenuMinTop(anchor);
        let top = Math.max(anchorRect.bottom + gap, minTop);
        const maxBottom = window.innerHeight - margin;
        if (top + menuHeight > maxBottom) {
            const aboveTop = anchorRect.top - gap - menuHeight;
            if (aboveTop >= margin && aboveTop >= minTop) {
                top = aboveTop;
            } else {
                top = Math.max(minTop, Math.max(margin, maxBottom - menuHeight));
            }
        }
        let left = anchorRect.right - menuWidth;
        left = Math.max(margin, Math.min(left, window.innerWidth - menuWidth - margin));
        menu.style.position = 'fixed';
        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
    }

    closeExecutionTabOverflowMenu(): void {
        const menu = this.host.executionTabOverflowMenu;
        const anchor = this.host.executionTabOverflowAnchor;
        if (!menu) {
            return;
        }
        menu.hidden = true;
        menu.classList.remove('theia-mod-open', 'theia-mod-floating');
        menu.style.position = '';
        menu.style.zIndex = '';
        menu.style.top = '';
        menu.style.left = '';
        const parent = anchor?.closest('.theia-mobile-transcript-tab-icon-select-host');
        if (parent && !parent.contains(menu)) {
            parent.append(menu);
        }
        anchor?.setAttribute('aria-expanded', 'false');
        this.host.executionTabOverflowDispose.dispose();
        this.host.executionTabOverflowDispose = Disposable.NULL;
        this.host.executionTabOverflowMenu = undefined;
        this.host.executionTabOverflowAnchor = undefined;
    }

    mountTranscriptSurfaceTab(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        tab: TranscriptTab,
    ): void {
        if (tab === 'plan') {
            this.host.renderPlanTab(this.host.transcriptPlanHost, this.host.transcriptLastConv);
        } else if (tab === 'review') {
            void this.host.mountTranscriptReviewWidget(project, summary);
        } else if (tab === 'preview') {
            this.host.renderPreviewTab(project, summary);
        } else if (tab === 'files') {
            this.host.ensureTranscriptFilesTab(project, summary);
        } else if (tab === 'terminal') {
            void this.host.ensureTranscriptTerminalTab(project, summary);
        }
        if (this.host.transcriptOpenProject) {
            this.syncExecutionSurfaceChrome(this.host.transcriptOpenProject);
        }
    }
}
