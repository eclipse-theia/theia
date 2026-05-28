// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { CommandRegistry, nls } from '@theia/core/lib/common';
import { CommonCommands } from '@theia/core/lib/browser/common-commands';

export const QAAP_AUTH_SIGN_IN_GITHUB_COMMAND = 'qaap.auth.signInGithub';
export const QAAP_AUTH_SIGN_OUT_COMMAND = 'qaap.auth.signOut';

const WORKBENCH_SHOW_COMMANDS = 'workbench.action.showCommands';
const WORKBENCH_OPEN_EXTENSIONS = 'workbench.view.extensions';
const WORKBENCH_OPEN_KEYBINDINGS = 'workbench.action.openGlobalKeybindings';

export interface QaapAccountMenuEntry {
    kind: 'action' | 'separator';
    label?: string;
    commandId?: string;
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
export function toggleQaapAccountMenu(anchor: HTMLElement, commands: CommandRegistry, entries: QaapAccountMenuEntry[]): void {
    if (isQaapAccountMenuOpen(anchor)) {
        dismissQaapAccountMenu();
        return;
    }
    openQaapAccountMenu(anchor, commands, entries);
}

export function openQaapAccountMenu(anchor: HTMLElement, commands: CommandRegistry, entries: QaapAccountMenuEntry[]): void {
    if (activeAnchor !== anchor) {
        dismissQaapAccountMenu();
    }

    const panel = document.createElement('div');
    panel.className = 'theia-qaap-account-menu';
    panel.setAttribute('role', 'menu');
    panel.tabIndex = -1;

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
        let top = rect.bottom + margin;
        let left = rect.right - panel.offsetWidth;
        const maxLeft = window.innerWidth - panel.offsetWidth - margin;
        const maxTop = window.innerHeight - panel.offsetHeight - margin;
        left = Math.max(margin, Math.min(left, maxLeft));
        if (top > maxTop) {
            top = Math.max(margin, rect.top - panel.offsetHeight - margin);
        }
        panel.style.top = `${top}px`;
        panel.style.left = `${left}px`;
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
