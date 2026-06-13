// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { HoverService } from '@theia/core/lib/browser';
import { PromptFragment } from '@theia/ai-core/lib/common';
import { GenericCapabilitySelections } from '@theia/ai-core';

export interface ChatInputProductContextElement {
    variableName: string;
    className?: string;
    isImage: boolean;
}

export interface ChatInputProductChromeContext {
    isEnabled?: boolean;
    pending: boolean;
    context: readonly ChatInputProductContextElement[];
    capabilityOverrideCount: number;
    hasUnsavedCapabilityChanges: boolean;
    genericCapabilities: GenericCapabilitySelections;
    quickCommands: readonly PromptFragment[];
    receivingAgentId?: string;
    onInsertQuickCommand: (commandName: string) => void;
    hoverService: HoverService;
}

export interface ChatInputProductChrome {
    renderEditorBoxHeader(context: ChatInputProductChromeContext): React.ReactNode;
    renderBeforeOptions(context: ChatInputProductChromeContext): React.ReactNode;
}

export let chatInputProductChrome: ChatInputProductChrome | undefined;

export function setChatInputProductChrome(chrome: ChatInputProductChrome | undefined): void {
    chatInputProductChrome = chrome;
}
