// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';

export const QAAP_MAXIMIZE_CHAT_COMMAND_ID = 'qaap.chat.maximize';
export const AI_CHAT_TOGGLE_COMMAND_ID = 'aiChat:toggle';
export const CHAT_VIEW_WIDGET_ID = 'chat-view-widget';

export interface QaapWatermarkEntryDef {
    readonly commandId: string;
    readonly labelKey: string;
    readonly defaultLabel: string;
    readonly commandCandidates?: readonly string[];
}

export const QAAP_SHOW_FILES_COMMAND_CANDIDATES = [
    'fileNavigator:toggle',
    'workbench.view.explorer'
] as const;

export const QAAP_GO_TO_FILE_COMMAND_CANDIDATES = [
    'file-search.openFile',
    'workbench.action.quickOpen'
] as const;

export const QAAP_WATERMARK_ENTRY_DEFS: readonly QaapWatermarkEntryDef[] = [
    {
        commandId: AI_CHAT_TOGGLE_COMMAND_ID,
        labelKey: 'qaap/watermark/openChat',
        defaultLabel: 'Abrir chat'
    },
    {
        commandId: 'workbench.action.terminal.toggleTerminal',
        labelKey: 'qaap/watermark/hideTerminal',
        defaultLabel: 'Ocultar terminal'
    },
    {
        commandId: 'fileNavigator:toggle',
        labelKey: 'qaap/watermark/showFiles',
        defaultLabel: 'Mostrar archivos',
        commandCandidates: QAAP_SHOW_FILES_COMMAND_CANDIDATES
    },
    {
        commandId: 'file-search.openFile',
        labelKey: 'qaap/watermark/goToFile',
        defaultLabel: 'Ir al archivo',
        commandCandidates: QAAP_GO_TO_FILE_COMMAND_CANDIDATES
    },
    {
        commandId: 'mini-browser.openUrl',
        labelKey: 'qaap/watermark/openBrowser',
        defaultLabel: 'Abrir navegador'
    },
    {
        commandId: QAAP_MAXIMIZE_CHAT_COMMAND_ID,
        labelKey: 'qaap/watermark/maximizeChat',
        defaultLabel: 'Maximizar chat'
    }
];

export const QAAP_WATERMARK_PREFERRED_KEYBINDINGS: Readonly<Record<string, string>> = {
    [AI_CHAT_TOGGLE_COMMAND_ID]: 'ctrlcmd+shift+l',
    'workbench.action.terminal.toggleTerminal': 'ctrlcmd+j',
    'fileNavigator:toggle': 'ctrlcmd+shift+e',
    'workbench.view.explorer': 'ctrlcmd+shift+e',
    'file-search.openFile': 'ctrlcmd+p',
    'workbench.action.quickOpen': 'ctrlcmd+p',
    'mini-browser.openUrl': 'ctrlcmd+shift+b',
    [QAAP_MAXIMIZE_CHAT_COMMAND_ID]: 'ctrlcmd+alt+e'
};

export function localizeWatermarkLabel(entry: QaapWatermarkEntryDef): string {
    return nls.localize(entry.labelKey, entry.defaultLabel);
}

export function resolveWatermarkCommandId(
    commandIds: readonly string[],
    isRegistered: (id: string) => boolean
): string | undefined {
    return commandIds.find(isRegistered);
}
