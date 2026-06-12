// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { Disposable } from '@theia/core/lib/common/disposable';
import {
    createMobileSheetGrabber,
    installMobilePullToRefresh,
    installMobileSheetDragDismiss,
} from './mobile-sheet-gestures';
import { MobileSnackbar } from './mobile-snackbar';
/** Panel surface for DOM shell construction and sheet gestures. */
export interface MobileProjectsPanelChromeHost {
    homeMode: boolean;
    root: HTMLElement;
    titleBlock: HTMLElement;
    titleRow: HTMLElement;
    headerBackBtn: HTMLButtonElement;
    sessionsMenuBtn: HTMLButtonElement;
    headerNewChatBtn: HTMLButtonElement;
    titleEl: HTMLHeadingElement;
    titleAttentionEl: HTMLSpanElement;
    headerExecutionCluster: HTMLElement;
    headerExecutionTabsHost: HTMLElement;
    subtitleEl: HTMLElement;
    accountBtn: HTMLButtonElement;
    accountAvatar: HTMLElement;
    headerSurfacePickerHost: HTMLElement;
    searchToggleBtn: HTMLButtonElement;
    filtersHost: HTMLElement;
    scroll: HTMLElement;
    diffProjectTabsHost: HTMLElement;
    diffWidgetHost: HTMLElement;
    stickyComposerHost: HTMLElement;
    newFabBtn: HTMLButtonElement;
    stickyComposerFabLiftObserver: ResizeObserver | undefined;
    dragDismissDispose: Disposable;
    pullToRefreshDispose: Disposable;
    onAccountClick: () => void;

    handleHeaderBackClick(): void;
    openWorkHubSessionsSidebar(): void;
    onHeaderNewChatClick(): Promise<void>;
    workHubSearchUi: import('./mobile-projects-work-hub-search-ui').MobileProjectsWorkHubSearchUi;
    onNewClick(): Promise<void>;
    onTitleTap(): void;
    composerHeaderUi: import('./mobile-projects-composer-header-ui').MobileProjectsComposerHeaderUi;
    updateAccountAvatar(): void;
    hide(): void;
    refreshInboxPullRequests(projects?: import('./mobile-projects-types').MobileProjectEntry[], force?: boolean): Promise<void>;
    refreshProjects(): Promise<void>;
    delegate: { onDismiss(): void };
    hubView: import('./mobile-projects-types').MobileProjectsHubView;
}

export class MobileProjectsPanelChromeUi {
    constructor(protected readonly host: MobileProjectsPanelChromeHost) { }

    constructPanelShell(): HTMLElement {
        const grabber = createMobileSheetGrabber();

        const header = document.createElement('header');
        header.className = 'theia-mobile-projects-header';

        const headerMainRow = document.createElement('div');
        headerMainRow.className = 'theia-mobile-projects-header-main';

        this.host.titleBlock = document.createElement('div');
        this.host.titleBlock.className = 'theia-mobile-projects-title-block';
        this.host.titleRow = document.createElement('div');
        this.host.titleRow.className = 'theia-mobile-projects-title-row';
        this.host.headerBackBtn = document.createElement('button');
        this.host.headerBackBtn.type = 'button';
        this.host.headerBackBtn.className = 'theia-mobile-projects-header-back';
        this.host.headerBackBtn.hidden = true;
        this.host.headerBackBtn.setAttribute('aria-hidden', 'true');
        this.host.headerBackBtn.title = nls.localize('qaap/mobileProjects/backToProjects', 'Back to projects');
        this.host.headerBackBtn.setAttribute('aria-label', this.host.headerBackBtn.title);
        this.host.headerBackBtn.innerHTML = '<span class="codicon codicon-chevron-left" aria-hidden="true"></span>';
        this.host.headerBackBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            this.host.handleHeaderBackClick();
        });
        this.host.sessionsMenuBtn = document.createElement('button');
        this.host.sessionsMenuBtn.type = 'button';
        this.host.sessionsMenuBtn.className = 'theia-mobile-projects-sessions-menu theia-mobile-projects-header-back';
        this.host.sessionsMenuBtn.hidden = true;
        this.host.sessionsMenuBtn.setAttribute('aria-hidden', 'true');
        this.host.sessionsMenuBtn.title = nls.localize('qaap/sessionsSidebar/open', 'Open session history');
        this.host.sessionsMenuBtn.setAttribute('aria-label', this.host.sessionsMenuBtn.title);
        this.host.sessionsMenuBtn.innerHTML = '<span class="codicon codicon-menu" aria-hidden="true"></span>';
        this.host.sessionsMenuBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            this.host.openWorkHubSessionsSidebar();
        });
        this.host.titleEl = document.createElement('h1');
        this.host.titleEl.className = 'theia-mobile-projects-title';
        this.host.titleEl.textContent = nls.localize('qaap/mobileProjects/title', 'Work Hub');
        this.host.titleAttentionEl = document.createElement('span');
        this.host.titleAttentionEl.className = 'theia-mobile-projects-title-attention';
        this.host.titleAttentionEl.hidden = true;
        this.host.titleAttentionEl.setAttribute('aria-hidden', 'true');
        this.host.headerExecutionCluster = document.createElement('div');
        this.host.headerExecutionCluster.className = 'theia-mobile-projects-header-execution-cluster';
        this.host.headerExecutionTabsHost = document.createElement('div');
        this.host.headerExecutionTabsHost.className = 'theia-mobile-projects-header-execution-tabs';
        this.host.headerExecutionTabsHost.hidden = true;
        this.host.subtitleEl = document.createElement('div');
        this.host.subtitleEl.className = this.host.homeMode ? 'theia-mobile-projects-subtitle' : 'theia-mobile-projects-meta';
        this.host.titleRow.append(this.host.sessionsMenuBtn, this.host.headerBackBtn, this.host.titleEl, this.host.titleAttentionEl);
        this.host.titleBlock.append(this.host.titleRow, this.host.subtitleEl);

        const actions = document.createElement('div');
        actions.className = 'theia-mobile-projects-header-actions';

        this.host.accountBtn = document.createElement('button');
        this.host.accountBtn.type = 'button';
        this.host.accountBtn.className = 'theia-workbench-nav-btn theia-workbench-account-btn';
        this.host.accountBtn.title = nls.localize('qaap/accountMenu/title', 'Account');
        this.host.accountBtn.setAttribute('aria-haspopup', 'menu');
        this.host.accountAvatar = document.createElement('span');
        this.host.accountAvatar.className = 'theia-workbench-account-avatar';
        this.host.accountAvatar.setAttribute('aria-hidden', 'true');
        this.host.accountBtn.appendChild(this.host.accountAvatar);
        this.host.accountBtn.addEventListener('click', this.host.onAccountClick);
        this.host.headerSurfacePickerHost = document.createElement('div');
        this.host.headerSurfacePickerHost.className = 'theia-mobile-projects-header-surface-picker';
        this.host.headerSurfacePickerHost.hidden = true;

        this.host.headerNewChatBtn = document.createElement('button');
        this.host.headerNewChatBtn.type = 'button';
        this.host.headerNewChatBtn.className = 'theia-workbench-nav-btn theia-mobile-projects-new-chat-btn';
        this.host.headerNewChatBtn.hidden = true;
        this.host.headerNewChatBtn.setAttribute('aria-hidden', 'true');
        this.host.headerNewChatBtn.title = nls.localize('qaap/sessionsSidebar/newChat', 'New agent');
        this.host.headerNewChatBtn.setAttribute('aria-label', this.host.headerNewChatBtn.title);
        this.host.headerNewChatBtn.innerHTML = '<span class="codicon codicon-add" aria-hidden="true"></span>';
        this.host.headerNewChatBtn.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            void this.host.onHeaderNewChatClick();
        });

        this.host.searchToggleBtn = document.createElement('button');
        this.host.searchToggleBtn.type = 'button';
        this.host.searchToggleBtn.className = 'theia-workbench-nav-btn theia-mobile-projects-search-toggle';
        this.host.searchToggleBtn.title = nls.localize('qaap/mobileProjects/searchToggle', 'Search');
        this.host.searchToggleBtn.setAttribute('aria-label', this.host.searchToggleBtn.title);
        this.host.searchToggleBtn.innerHTML = '<span class="codicon codicon-search" aria-hidden="true"></span>';
        this.host.searchToggleBtn.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            this.host.workHubSearchUi.openWorkHubSearchQuickPick();
        });

        this.host.headerExecutionCluster.append(
            this.host.headerNewChatBtn,
            this.host.headerExecutionTabsHost,
        );
        actions.append(
            this.host.headerSurfacePickerHost,
            this.host.searchToggleBtn,
            this.host.accountBtn,
        );
        headerMainRow.append(this.host.titleBlock, this.host.headerExecutionCluster, actions);
        header.append(headerMainRow);

        this.host.filtersHost = document.createElement('div');
        this.host.filtersHost.className = 'theia-mobile-projects-filters-host';
        this.host.filtersHost.hidden = true;

        this.host.scroll = document.createElement('div');
        this.host.scroll.className = 'theia-mobile-projects-scroll';

        this.host.diffProjectTabsHost = document.createElement('div');
        this.host.diffProjectTabsHost.className = 'theia-mobile-projects-diff-tabs';
        this.host.diffProjectTabsHost.hidden = true;
        this.host.diffWidgetHost = document.createElement('div');
        this.host.diffWidgetHost.className = 'theia-mobile-projects-diff-widget-host';
        this.host.diffWidgetHost.hidden = true;

        this.host.stickyComposerHost = document.createElement('div');
        this.host.stickyComposerHost.className = 'theia-mobile-projects-sticky-composer';
        this.host.stickyComposerHost.hidden = true;

        this.host.newFabBtn = document.createElement('button');
        this.host.newFabBtn.type = 'button';
        this.host.newFabBtn.className = 'theia-mobile-projects-fab';
        this.host.newFabBtn.title = nls.localize('qaap/mobileProjects/new', 'New');
        this.host.newFabBtn.setAttribute('aria-label', nls.localize('qaap/mobileProjects/new', 'New'));
        this.host.newFabBtn.innerHTML = '<span class="codicon codicon-add" aria-hidden="true"></span>';
        this.host.newFabBtn.hidden = true;
        this.host.newFabBtn.addEventListener('click', () => { void this.host.onNewClick(); });

        this.host.root.append(
            grabber,
            header,
            this.host.filtersHost,
            this.host.scroll,
            this.host.stickyComposerHost,
            this.host.newFabBtn,
        );
        return grabber;
    }

    wirePanelInteractions(grabber: HTMLElement, onAuthSessionChanged: () => void): void {
        if (typeof ResizeObserver !== 'undefined') {
            this.host.stickyComposerFabLiftObserver = new ResizeObserver(() => {
                if (!this.host.stickyComposerHost.hidden) {
                    this.host.composerHeaderUi.updateStickyComposerFabLift();
                }
            });
            this.host.stickyComposerFabLiftObserver.observe(this.host.stickyComposerHost);
        }

        this.host.titleBlock.addEventListener('click', () => this.host.onTitleTap());
        window.addEventListener('qaap-auth-session-changed', onAuthSessionChanged);
        this.host.updateAccountAvatar();

        if (!this.host.homeMode) {
            this.host.dragDismissDispose = installMobileSheetDragDismiss({
                target: this.host.root,
                grip: grabber,
                onDismiss: () => {
                    this.host.hide();
                    this.host.delegate.onDismiss();
                },
            });
        }

        this.host.pullToRefreshDispose = installMobilePullToRefresh({
            scroller: this.host.scroll,
            host: this.host.root,
            onRefresh: async () => {
                if (this.host.hubView === 'review') {
                    await this.host.refreshInboxPullRequests(undefined, true);
                }
                await this.host.refreshProjects();
                MobileSnackbar.show(
                    nls.localize('qaap/mobileProjects/refreshed', 'Work Hub refreshed'),
                    { kind: 'success', duration: 1400 },
                );
            },
        });
    }
}
