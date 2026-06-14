// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Widget as LuminoWidget } from '@lumino/widgets';

/**
 * Commands referenced for active-state and click-through; declared as strings so `@theia/core` stays free of
 * optional dependencies (`@theia/ai-chat-ui`, `@theia/terminal`, `@theia/mini-browser`, …).
 */
export const WORKBENCH_AI_CHAT_TOGGLE = 'aiChat:toggle';
export const WORKBENCH_CHAT_VIEW_WIDGET_ID = 'chat-view-widget';
export const WORKBENCH_TOGGLE_TERMINAL = 'workbench.action.terminal.toggleTerminal';
/** Shared preview tab id ({@link MiniBrowserOpenHandler.PREVIEW_URI}). */
export const MINI_BROWSER_PREVIEW_WIDGET_ID = 'mini-browser:__minibrowser__preview__';
export const EXPLORER_VIEW_CONTAINER_ID = 'explorer-view-container';
export const OPEN_AI_CONFIGURATION_COMMAND = 'aiConfiguration:open';
export const EDIT_CHAT_SESSION_SETTINGS_COMMAND = 'chat:widget:session-settings';

/** Shell class toggled while the bottom (terminal) panel is expanded on mobile. */
export const MOBILE_BOTTOM_OPEN_CLASS = 'theia-mod-mobile-bottom-open';

/** Keep editor / preview chrome visible when the bottom panel (inspector, terminal, …) is open. */
export const MOBILE_BOTTOM_SPLIT_MAIN_MIN_RATIO = 0.28;

/** Default bottom share when no persisted sash size exists yet. */
export const MOBILE_BOTTOM_SPLIT_DEFAULT_BOTTOM_RATIO = 0.38;

/** {@link ApplicationShell} overlay host for {@link MAXIMIZED_CLASS} bottom panel (not in public API). */
export interface ShellWithMaximizedOverlay {
    readonly maximizedElement: HTMLElement;
}

export type MobileBottomButtonId =
    | 'projects'
    | 'agent'
    | 'preview'
    | 'explore'
    | 'pr'
    | 'terminal'
    | 'hub-home'
    | 'hub-projects'
    | 'hub-tasks'
    | 'hub-review'
    | 'hub-inbox'
    | 'hub-team'
    | 'hub-automations';

export interface MobileBottomButton {
    id: MobileBottomButtonId;
    label: string;
    icon: string;
    commandId?: string;
}

export interface BottomBarSecondaryItem {
    label: string;
    icon?: string;
    detail?: string;
    run: () => Promise<void> | void;
}

export class MobileBottomBarWidget extends LuminoWidget {
    constructor() {
        const node = document.createElement('nav');
        node.className = 'theia-mobile-bottom-activity-bar';
        node.setAttribute('role', 'navigation');
        super({ node });
        this.id = 'theia-mobile-bottom-bar';
    }
}
