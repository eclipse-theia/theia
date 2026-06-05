// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { renderQaapAccountAvatarVisual } from './qaap-account-avatar-visual';
import { dismissQaapAccountMenu } from './qaap-workbench-account-menu';
import { installMobileVerticalTouchScroll } from './mobile-vertical-touch-scroll';
import { MobileHaptics } from './mobile-haptics';

export const QAAP_MOBILE_SESSIONS_SIDEBAR_BODY_CLASS = 'theia-mobile-mod-sessions-sidebar-open';

/** localStorage key — first open shows a one-time dismiss hint. */
export const QAAP_SESSIONS_SIDEBAR_DISMISS_HINT_KEY = 'qaap.sessionsSidebar.dismissHintSeen';

/** Minimum horizontal delta (px) to close via left-edge swipe-left (symmetric to dashboard open). */
export const QAAP_SESSIONS_SIDEBAR_EDGE_SWIPE_DISMISS_MIN_DELTA = 40;

const DISMISS_HINT_DURATION_MS = 4200;

export interface MobileWorkHubSessionsSidebarDelegate {
    renderSessionList(host: HTMLElement): void;
    onNewChat(): void;
    onClose(): void;
    onAccountMenu?(anchor: HTMLButtonElement): void;
    onSearch?: () => void;
    onExtensions?: () => void;
    onAutomations?: () => void;
}

/**
 * Full-screen sessions sidebar (mockup `.mock-sidebar`). List rows are rendered by the
 * delegate via {@link MobileProjectsPanel.createTaskItem} so behaviour matches Tasks inbox.
 */
export class MobileWorkHubSessionsSidebar {

    protected visible = false;
    protected scrollTouchDispose: Disposable = Disposable.NULL;
    protected edgeSwipeDispose: Disposable = Disposable.NULL;
    protected dismissHintTimer: number | undefined;
    protected leftEdgeTouchStartX = 0;
    protected readonly root: HTMLElement;
    protected readonly panel: HTMLElement;
    protected readonly leftEdgeZone: HTMLElement;
    protected readonly closeBtn: HTMLButtonElement;
    protected readonly accountBtn: HTMLButtonElement;
    protected readonly accountAvatar: HTMLSpanElement;
    protected readonly accountLabel: HTMLSpanElement;
    protected readonly scrollHost: HTMLElement;
    protected readonly listHost: HTMLElement;
    protected dismissHint: HTMLElement | undefined;

    constructor(protected readonly delegate: MobileWorkHubSessionsSidebarDelegate) {
        this.root = document.createElement('aside');
        this.root.className = 'theia-mobile-work-hub-sessions-sidebar';
        this.root.setAttribute('role', 'dialog');
        this.root.setAttribute('aria-modal', 'true');
        this.root.setAttribute('aria-label', nls.localize('qaap/sessionsSidebar/label', 'Sessions and projects'));
        this.root.hidden = true;
        this.root.setAttribute('aria-hidden', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-work-hub-sessions-sidebar-backdrop';
        backdrop.setAttribute('aria-hidden', 'true');

        this.panel = document.createElement('div');
        this.panel.className = 'theia-mobile-work-hub-sessions-sidebar-panel';

        const head = document.createElement('header');
        head.className = 'theia-mobile-work-hub-sessions-sidebar-head';
        const brand = document.createElement('div');
        brand.className = 'theia-mobile-work-hub-sessions-sidebar-brand';
        brand.textContent = FrontendApplicationConfigProvider.get().applicationName?.trim()
            || nls.localize('qaap/mobileProjects/title', 'Work Hub');
        this.closeBtn = document.createElement('button');
        this.closeBtn.type = 'button';
        this.closeBtn.className = 'theia-mobile-work-hub-sessions-sidebar-close codicon codicon-chevron-left';
        this.closeBtn.title = nls.localize('qaap/sessionsSidebar/close', 'Close');
        this.closeBtn.setAttribute('aria-label', this.closeBtn.title);
        this.closeBtn.addEventListener('click', ev => {
            if (this.closeBtn.classList.contains('theia-mod-close-guarded')) {
                ev.preventDefault();
                ev.stopPropagation();
                return;
            }
            this.hide();
        });
        head.append(brand, this.closeBtn);

        const footer = document.createElement('footer');
        footer.className = 'theia-mobile-work-hub-sessions-sidebar-foot';
        this.accountBtn = document.createElement('button');
        this.accountBtn.type = 'button';
        this.accountBtn.className = 'theia-workbench-nav-btn theia-workbench-account-btn theia-mobile-work-hub-sessions-sidebar-account-btn';
        this.accountBtn.title = nls.localize('qaap/accountMenu/title', 'Account');
        this.accountBtn.setAttribute('aria-haspopup', 'menu');
        this.accountAvatar = document.createElement('span');
        this.accountAvatar.className = 'theia-workbench-account-avatar';
        this.accountAvatar.setAttribute('aria-hidden', 'true');
        this.accountLabel = document.createElement('span');
        this.accountLabel.className = 'theia-mobile-work-hub-sessions-sidebar-account-label';
        this.accountBtn.append(this.accountAvatar, this.accountLabel);
        this.accountBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            this.delegate.onAccountMenu?.(this.accountBtn);
        });
        footer.append(this.accountBtn);
        this.updateAccountAvatar();

        const nav = document.createElement('nav');
        nav.className = 'theia-mobile-work-hub-sessions-sidebar-nav';
        nav.setAttribute('aria-label', nls.localize('qaap/sessionsSidebar/navLabel', 'Sidebar shortcuts'));
        nav.append(
            this.createNavButton(
                'codicon-edit',
                nls.localize('qaap/sessionsSidebar/newChat', 'New chat'),
                () => {
                    this.hide();
                    this.delegate.onNewChat();
                },
            ),
            this.createNavButton(
                'codicon-search',
                nls.localize('qaap/sessionsSidebar/search', 'Search'),
                () => this.delegate.onSearch?.(),
            ),
            this.createNavButton(
                'codicon-extensions',
                nls.localize('qaap/sessionsSidebar/extensions', 'Extensions'),
                () => this.delegate.onExtensions?.(),
            ),
            this.createNavButton(
                'codicon-zap',
                nls.localize('qaap/mobileBottomBar/hubRoutines', 'Routines'),
                () => this.delegate.onAutomations?.(),
            ),
        );
        this.scrollHost = document.createElement('div');
        this.scrollHost.className = 'theia-mobile-work-hub-sessions-sidebar-scroll';
        this.listHost = document.createElement('div');
        this.listHost.className = 'theia-mobile-work-hub-sessions-sidebar-list';
        this.scrollHost.append(this.listHost);

        this.panel.append(head, nav, this.scrollHost, footer);

        this.leftEdgeZone = document.createElement('div');
        this.leftEdgeZone.className = 'theia-mobile-work-hub-sessions-sidebar-edge-zone';
        this.leftEdgeZone.setAttribute('aria-hidden', 'true');

        this.root.append(backdrop, this.panel, this.leftEdgeZone);

        this.onKeyDown = this.onKeyDown.bind(this);
        this.onLeftEdgeTouchStart = this.onLeftEdgeTouchStart.bind(this);
        this.onLeftEdgeTouchEnd = this.onLeftEdgeTouchEnd.bind(this);
    }

    get node(): HTMLElement {
        return this.root;
    }

    getScrollElement(): HTMLElement {
        return this.scrollHost;
    }

    isVisible(): boolean {
        return this.visible;
    }

    show(): void {
        if (this.visible) {
            this.refreshList();
            return;
        }
        this.visible = true;
        this.root.hidden = false;
        this.root.setAttribute('aria-hidden', 'false');
        void this.root.offsetWidth;
        this.root.classList.add('theia-mod-visible');
        document.body.classList.add(QAAP_MOBILE_SESSIONS_SIDEBAR_BODY_CLASS);
        document.addEventListener('keydown', this.onKeyDown, true);
        this.guardSidebarCloseButton(this.closeBtn);
        this.installLeftEdgeSwipeDismiss();
        this.updateAccountAvatar();
        this.refreshList();
        this.maybeShowDismissHint();
    }

    updateAccountAvatar(): void {
        renderQaapAccountAvatarVisual(this.accountAvatar, { titleTarget: this.accountBtn });
        this.accountLabel.textContent = this.accountBtn.title;
    }

    /** Evita ghost-tap en la posición del ☰ al abrir (mockup). */
    protected guardSidebarCloseButton(closeBtn: HTMLButtonElement): void {
        closeBtn.classList.add('theia-mod-close-guarded');
        window.setTimeout(() => {
            closeBtn.classList.remove('theia-mod-close-guarded');
        }, 420);
    }

    /** Re-apply after list paint so iOS fallback sees the final scroll height. */
    protected ensureScrollTouchFallback(): void {
        this.scrollTouchDispose.dispose();
        delete this.scrollHost.dataset.theiaMobileScrollY;
        this.scrollTouchDispose = installMobileVerticalTouchScroll(this.scrollHost);
        window.requestAnimationFrame(() => {
            if (!this.visible) {
                return;
            }
            this.scrollTouchDispose.dispose();
            delete this.scrollHost.dataset.theiaMobileScrollY;
            this.scrollTouchDispose = installMobileVerticalTouchScroll(this.scrollHost);
        });
    }

    hide(): void {
        if (!this.visible) {
            return;
        }
        dismissQaapAccountMenu();
        this.scrollTouchDispose.dispose();
        this.edgeSwipeDispose.dispose();
        this.hideDismissHint();
        this.visible = false;
        this.root.classList.remove('theia-mod-visible');
        this.root.setAttribute('aria-hidden', 'true');
        document.body.classList.remove(QAAP_MOBILE_SESSIONS_SIDEBAR_BODY_CLASS);
        document.removeEventListener('keydown', this.onKeyDown, true);
        window.setTimeout(() => {
            if (!this.visible) {
                this.root.hidden = true;
            }
        }, 280);
        this.delegate.onClose();
    }

    toggle(): void {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    refreshList(): void {
        this.listHost.replaceChildren();
        this.delegate.renderSessionList(this.listHost);
        if (this.visible) {
            this.ensureScrollTouchFallback();
        }
    }

    protected onKeyDown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            this.hide();
        }
    }

    /** Swipe left from the left edge closes the sidebar (inverse of dashboard open swipe). */
    protected installLeftEdgeSwipeDismiss(): void {
        this.edgeSwipeDispose.dispose();
        const toDispose = new DisposableCollection();
        this.leftEdgeZone.addEventListener('touchstart', this.onLeftEdgeTouchStart, { passive: true });
        toDispose.push(Disposable.create(() => {
            this.leftEdgeZone.removeEventListener('touchstart', this.onLeftEdgeTouchStart);
        }));
        this.leftEdgeZone.addEventListener('touchend', this.onLeftEdgeTouchEnd, { passive: true });
        toDispose.push(Disposable.create(() => {
            this.leftEdgeZone.removeEventListener('touchend', this.onLeftEdgeTouchEnd);
        }));
        this.edgeSwipeDispose = toDispose;
    }

    protected onLeftEdgeTouchStart(event: TouchEvent): void {
        this.leftEdgeTouchStartX = event.changedTouches[0]?.clientX ?? 0;
    }

    protected onLeftEdgeTouchEnd(event: TouchEvent): void {
        const x = event.changedTouches[0]?.clientX ?? 0;
        if (this.leftEdgeTouchStartX - x < QAAP_SESSIONS_SIDEBAR_EDGE_SWIPE_DISMISS_MIN_DELTA) {
            return;
        }
        MobileHaptics.fire(MobileHaptics.MEDIUM);
        this.hide();
    }

    protected maybeShowDismissHint(): void {
        if (typeof window === 'undefined' || hasSeenSessionsSidebarDismissHint()) {
            return;
        }
        markSessionsSidebarDismissHintSeen();
        if (!this.dismissHint) {
            this.dismissHint = document.createElement('p');
            this.dismissHint.className = 'theia-mobile-work-hub-sessions-sidebar-dismiss-hint';
            this.dismissHint.setAttribute('role', 'status');
            this.dismissHint.textContent = nls.localize(
                'qaap/sessionsSidebar/dismissHint',
                'Swipe or tap ← to return to chat',
            );
            this.root.append(this.dismissHint);
        }
        this.dismissHint.hidden = false;
        void this.dismissHint.offsetWidth;
        this.dismissHint.classList.add('theia-mod-visible');
        if (this.dismissHintTimer !== undefined) {
            window.clearTimeout(this.dismissHintTimer);
        }
        this.dismissHintTimer = window.setTimeout(() => this.hideDismissHint(), DISMISS_HINT_DURATION_MS);
    }

    protected hideDismissHint(): void {
        if (this.dismissHintTimer !== undefined) {
            window.clearTimeout(this.dismissHintTimer);
            this.dismissHintTimer = undefined;
        }
        if (!this.dismissHint) {
            return;
        }
        this.dismissHint.classList.remove('theia-mod-visible');
        window.setTimeout(() => {
            if (this.dismissHint && !this.dismissHint.classList.contains('theia-mod-visible')) {
                this.dismissHint.hidden = true;
            }
        }, 220);
    }

    protected createNavButton(iconClass: string, label: string, onClick?: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theia-mobile-work-hub-sessions-sidebar-nav-item';
        const icon = document.createElement('span');
        icon.className = `codicon ${iconClass}`;
        icon.setAttribute('aria-hidden', 'true');
        btn.append(icon, document.createTextNode(label));
        if (onClick) {
            btn.addEventListener('click', () => {
                onClick();
            });
        }
        return btn;
    }
}

export function hasSeenSessionsSidebarDismissHint(): boolean {
    if (typeof window === 'undefined') {
        return true;
    }
    try {
        return window.localStorage.getItem(QAAP_SESSIONS_SIDEBAR_DISMISS_HINT_KEY) === '1';
    } catch {
        return true;
    }
}

export function markSessionsSidebarDismissHintSeen(): void {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(QAAP_SESSIONS_SIDEBAR_DISMISS_HINT_KEY, '1');
    } catch {
        /* private browsing / quota */
    }
}
