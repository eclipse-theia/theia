// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { CommandRegistry, nls } from '@theia/core/lib/common';
import { CommonCommands } from '@theia/core/lib/browser/common-commands';
import type { WorkHubCatalogAction, WorkHubCatalogItem, WorkHubCatalogSection } from '../common/mobile-work-hub-catalog';
import { bindCatalogCardTapFeedback } from './qaap-catalog-card-tap-feedback';

export const QAAP_AUTH_SIGN_IN_GITHUB_COMMAND = 'qaap.auth.signInGithub';
export const QAAP_AUTH_SIGN_OUT_COMMAND = 'qaap.auth.signOut';
export const QAAP_WORK_HUB_OVERVIEW_COMMAND = 'qaap.workHub.showOverview';
export const QAAP_MOBILE_OPEN_DESKTOP_IDE_COMMAND = 'qaap.mobile.openDesktopIde';

const WORKBENCH_SHOW_COMMANDS = 'workbench.action.showCommands';
const WORKBENCH_OPEN_EXTENSIONS = 'workbench.view.extensions';
const WORKBENCH_OPEN_KEYBINDINGS = 'workbench.action.openGlobalKeybindings';

export interface QaapAccountMenuEntry {
    kind: 'action' | 'separator';
    label?: string;
    commandId?: string;
}

export interface QaapAccountMenuGettingStartedOptions {
    readonly section: WorkHubCatalogSection;
    readonly onCatalogAction: (action: WorkHubCatalogAction) => void;
}

export interface QaapAccountMenuOpenOptions {
    /** Prefer opening above the anchor (e.g. sessions sidebar footer). */
    readonly placement?: 'below' | 'above';
    /** Gap in px between menu and anchor (default 4 above, 8 below). */
    readonly anchorGap?: number;
    /** Invoked when the user picks a menu item or catalog card (before dismiss). */
    readonly onMenuAction?: () => void;
}

let activeMenu: HTMLElement | undefined;
let activeDismiss: (() => void) | undefined;
let activeAnchor: HTMLElement | undefined;

export function buildQaapAccountMenuEntries(signedIn: boolean = true): QaapAccountMenuEntry[] {
    if (!signedIn) {
        return [
            {
                kind: 'action',
                label: nls.localize('qaap/accountMenu/signInGithub', 'Sign in with GitHub'),
                commandId: QAAP_AUTH_SIGN_IN_GITHUB_COMMAND,
            },
            { kind: 'separator' },
            {
                kind: 'action',
                label: nls.localize('qaap/accountMenu/settings', 'Settings'),
                commandId: CommonCommands.OPEN_PREFERENCES.id,
            },
        ];
    }
    return [
        {
            kind: 'action',
            label: nls.localize('qaap/accountMenu/commandPalette', 'Command Palette…'),
            commandId: WORKBENCH_SHOW_COMMANDS,
        },
        {
            kind: 'action',
            label: nls.localize('qaap/accountMenu/workHubOverview', 'Work Hub overview'),
            commandId: QAAP_WORK_HUB_OVERVIEW_COMMAND,
        },
        {
            kind: 'action',
            label: nls.localize('qaap/accountMenu/openDesktopIde', 'Open IDE'),
            commandId: QAAP_MOBILE_OPEN_DESKTOP_IDE_COMMAND,
        },
        { kind: 'separator' },
        {
            kind: 'action',
            label: nls.localize('qaap/accountMenu/settings', 'Settings'),
            commandId: CommonCommands.OPEN_PREFERENCES.id,
        },
        {
            kind: 'action',
            label: nls.localize('qaap/accountMenu/extensions', 'Extensions'),
            commandId: WORKBENCH_OPEN_EXTENSIONS,
        },
        {
            kind: 'action',
            label: nls.localize('qaap/accountMenu/keybindings', 'Keyboard Shortcuts'),
            commandId: WORKBENCH_OPEN_KEYBINDINGS,
        },
        { kind: 'separator' },
        {
            kind: 'action',
            label: nls.localize('qaap/accountMenu/signOut', 'Sign Out'),
            commandId: QAAP_AUTH_SIGN_OUT_COMMAND,
        },
    ];
}

/** Minimal account menu for Work Hub / mobile projects (auth only). */
export function buildQaapAccountMenuSignOutOnly(signedIn: boolean): QaapAccountMenuEntry[] {
    if (!signedIn) {
        return [
            {
                kind: 'action',
                label: nls.localize('qaap/accountMenu/signInGithub', 'Sign in with GitHub'),
                commandId: QAAP_AUTH_SIGN_IN_GITHUB_COMMAND,
            },
        ];
    }
    return [
        {
            kind: 'action',
            label: nls.localize('qaap/accountMenu/signOut', 'Sign Out'),
            commandId: QAAP_AUTH_SIGN_OUT_COMMAND,
        },
    ];
}

export function dismissQaapAccountMenu(): void {
    activeDismiss?.();
}

export function isQaapAccountMenuOpen(anchor?: HTMLElement): boolean {
    if (!activeMenu || !activeDismiss) {
        return false;
    }
    if (anchor !== undefined && activeAnchor !== anchor) {
        return false;
    }
    return true;
}

/** Open the account menu, or close it if it is already open for the same anchor. */
export function toggleQaapAccountMenu(
    anchor: HTMLElement,
    commands: CommandRegistry,
    entries: QaapAccountMenuEntry[],
    gettingStarted?: QaapAccountMenuGettingStartedOptions,
    openOptions?: QaapAccountMenuOpenOptions,
): void {
    if (isQaapAccountMenuOpen(anchor)) {
        dismissQaapAccountMenu();
        return;
    }
    openQaapAccountMenu(anchor, commands, entries, gettingStarted, openOptions);
}

export function openQaapAccountMenu(
    anchor: HTMLElement,
    commands: CommandRegistry,
    entries: QaapAccountMenuEntry[],
    gettingStarted?: QaapAccountMenuGettingStartedOptions,
    openOptions?: QaapAccountMenuOpenOptions,
): void {
    if (activeAnchor !== anchor) {
        dismissQaapAccountMenu();
    }

    const panel = document.createElement('div');
    panel.className = 'theia-qaap-account-menu';
    panel.setAttribute('role', 'menu');
    panel.tabIndex = -1;

    if (gettingStarted && gettingStarted.section.items.length > 0) {
        panel.classList.add('theia-mod-with-getting-started');
        panel.appendChild(createAccountMenuGettingStartedBlock(
            gettingStarted.section,
            gettingStarted.onCatalogAction,
            openOptions?.onMenuAction,
        ));
        const sep = document.createElement('div');
        sep.className = 'theia-qaap-account-menu-separator';
        sep.setAttribute('role', 'separator');
        panel.appendChild(sep);
    }

    for (const entry of entries) {
        if (entry.kind === 'separator') {
            const sep = document.createElement('div');
            sep.className = 'theia-qaap-account-menu-separator';
            sep.setAttribute('role', 'separator');
            panel.appendChild(sep);
            continue;
        }
        const commandId = entry.commandId;
        if (!commandId || !entry.label) {
            continue;
        }
        const isQaapAuthCommand = commandId === QAAP_AUTH_SIGN_OUT_COMMAND
            || commandId === QAAP_AUTH_SIGN_IN_GITHUB_COMMAND;
        if (!isQaapAuthCommand && !commands.getCommand(commandId)) {
            continue;
        }
        if (!isQaapAuthCommand && !commands.isEnabled(commandId)) {
            continue;
        }
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'theia-qaap-account-menu-item';
        item.setAttribute('role', 'menuitem');
        item.textContent = entry.label;
        item.addEventListener('click', () => {
            openOptions?.onMenuAction?.();
            dismissQaapAccountMenu();
            if (isQaapAuthCommand || (commands.getCommand(commandId) && commands.isEnabled(commandId))) {
                void commands.executeCommand(commandId).catch(() => undefined);
            }
        });
        panel.appendChild(item);
    }

    if (!panel.childElementCount) {
        return;
    }

    document.body.appendChild(panel);
    activeMenu = panel;
    activeAnchor = anchor;
    anchor.setAttribute('aria-expanded', 'true');

    const positionPanel = (): void => {
        const rect = anchor.getBoundingClientRect();
        const margin = 8;
        const gap = openOptions?.anchorGap ?? (openOptions?.placement === 'above' ? 4 : 8);
        const maxLeft = window.innerWidth - panel.offsetWidth - margin;
        let left = openOptions?.placement === 'above' ? rect.left : rect.right - panel.offsetWidth;
        left = Math.max(margin, Math.min(left, maxLeft));
        panel.style.left = `${left}px`;
        if (openOptions?.placement === 'above') {
            panel.style.top = 'auto';
            panel.style.bottom = `${window.innerHeight - rect.top + gap}px`;
            const maxHeight = Math.max(160, rect.top - gap - margin);
            panel.style.maxHeight = `${maxHeight}px`;
            panel.style.overflowY = 'auto';
            return;
        }
        panel.style.bottom = 'auto';
        panel.style.maxHeight = '';
        panel.style.overflowY = '';
        let top = rect.bottom + gap;
        const maxTop = window.innerHeight - panel.offsetHeight - margin;
        if (top > maxTop) {
            top = Math.max(margin, rect.top - panel.offsetHeight - gap);
        }
        panel.style.top = `${top}px`;
    };

    const onPointerDown = (event: PointerEvent): void => {
        const target = event.target as Node | null;
        if (target && (panel.contains(target) || anchor.contains(target))) {
            return;
        }
        dismissQaapAccountMenu();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
            event.preventDefault();
            dismissQaapAccountMenu();
            anchor.focus();
        }
    };

    const dismiss = (): void => {
        document.removeEventListener('pointerdown', onPointerDown, true);
        document.removeEventListener('keydown', onKeyDown, true);
        panel.remove();
        if (activeMenu === panel) {
            activeMenu = undefined;
        }
        if (activeDismiss === dismiss) {
            activeDismiss = undefined;
        }
        if (activeAnchor === anchor) {
            anchor.setAttribute('aria-expanded', 'false');
            anchor.classList.remove('theia-mod-active');
            activeAnchor = undefined;
        }
    };

    activeDismiss = dismiss;
    anchor.classList.add('theia-mod-active');
    requestAnimationFrame(() => {
        positionPanel();
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown, true);
        panel.focus();
    });
}

function createAccountMenuGettingStartedBlock(
    section: WorkHubCatalogSection,
    onCatalogAction: (action: WorkHubCatalogAction) => void,
    onMenuAction?: () => void,
): HTMLElement {
    const block = document.createElement('div');
    block.className = 'theia-qaap-account-menu-getting-started';

    const head = document.createElement('div');
    head.className = 'theia-qaap-account-menu-getting-started-head';
    const title = document.createElement('span');
    title.className = 'theia-qaap-account-menu-getting-started-title';
    title.textContent = section.title;
    head.append(title);

    const list = document.createElement('div');
    list.className = 'theia-qaap-account-menu-getting-started-cards';
    for (const item of section.items) {
        list.appendChild(createAccountMenuCatalogCard(item, onCatalogAction, onMenuAction));
    }

    block.append(head, list);
    return block;
}

function createAccountMenuCatalogCard(
    item: WorkHubCatalogItem,
    onCatalogAction: (action: WorkHubCatalogAction) => void,
    onMenuAction?: () => void,
): HTMLElement {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'theia-qaap-account-menu-catalog-card';
    card.setAttribute('role', 'menuitem');
    if (item.accent) {
        card.style.setProperty('--qaap-hub-catalog-accent', item.accent);
    }

    const icon = document.createElement('span');
    icon.className = `theia-qaap-account-menu-catalog-card-icon codicon ${item.iconClass}`;
    icon.setAttribute('aria-hidden', 'true');

    const body = document.createElement('div');
    body.className = 'theia-qaap-account-menu-catalog-card-body';

    const title = document.createElement('span');
    title.className = 'theia-qaap-account-menu-catalog-card-title';
    title.textContent = item.title;

    const subtitle = document.createElement('span');
    subtitle.className = 'theia-qaap-account-menu-catalog-card-subtitle';
    subtitle.textContent = item.subtitle;

    body.append(title, subtitle);

    if (item.progress !== undefined) {
        const progressWrap = document.createElement('div');
        progressWrap.className = 'theia-qaap-account-menu-catalog-card-progress';
        progressWrap.setAttribute('role', 'progressbar');
        progressWrap.setAttribute('aria-valuemin', '0');
        progressWrap.setAttribute('aria-valuemax', '100');
        const percent = Math.round(Math.max(0, Math.min(1, item.progress)) * 100);
        progressWrap.setAttribute('aria-valuenow', String(percent));
        const bar = document.createElement('span');
        bar.className = 'theia-qaap-account-menu-catalog-card-progress-bar';
        bar.style.width = `${percent}%`;
        progressWrap.append(bar);
        body.append(progressWrap);
    }

    if (item.meta) {
        const meta = document.createElement('span');
        meta.className = 'theia-qaap-account-menu-catalog-card-meta';
        meta.textContent = item.meta;
        body.append(meta);
    }

    card.append(icon, body);
    bindCatalogCardTapFeedback(card);
    card.addEventListener('click', () => {
        onMenuAction?.();
        dismissQaapAccountMenu();
        onCatalogAction(item.action);
    });
    return card;
}
