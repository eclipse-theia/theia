// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { HoverService } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';
import { PromptFragment } from '@theia/ai-core/lib/common';
import { GenericCapabilitySelections } from '@theia/ai-core';
import {
    ChatInputProductChrome,
    ChatInputProductChromeContext,
    ChatInputProductContextElement,
} from '@theia/ai-chat-ui/lib/browser/chat-input-product-chrome';

interface QuickCommand {
    name: string;
    description?: string;
}

function buildQuickCommands(commands: readonly PromptFragment[], agentId?: string): QuickCommand[] {
    return commands
        .filter(command => !agentId || !command.commandAgents || command.commandAgents.includes(agentId))
        .map(command => ({
            name: command.commandName ?? command.id,
            description: command.commandDescription ?? command.description
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 4);
}

interface ChatContextSummary {
    total: number;
    files: number;
    images: number;
    invalid: number;
    warnings: number;
    label: string;
    shortLabel: string;
}

function buildContextSummary(context: readonly ChatInputProductContextElement[]): ChatContextSummary {
    const files = context.filter(element => element.variableName === 'file').length;
    const images = context.filter(element => element.isImage).length;
    const invalid = context.filter(element => element.className === 'invalid-file').length;
    const warnings = context.filter(element => element.className === 'warning-file').length;
    const total = context.length;
    const parts: string[] = [];
    if (files > 0) {
        parts.push(nls.localizeByDefault('{0} files', files));
    }
    if (images > 0) {
        parts.push(nls.localize('theia/ai/chat-ui/contextImagesCount', '{0} images', images));
    }
    if (warnings > 0) {
        parts.push(nls.localize('theia/ai/chat-ui/contextWarningsCount', '{0} warnings', warnings));
    }
    if (invalid > 0) {
        parts.push(nls.localize('theia/ai/chat-ui/contextInvalidCount', '{0} invalid', invalid));
    }
    const label = parts.length > 0
        ? parts.join(', ')
        : nls.localize('theia/ai/chat-ui/contextItemsCount', '{0} context items', total);
    const shortLabel = total > 0
        ? nls.localize('theia/ai/chat-ui/contextShortCount', '{0} ctx', total)
        : nls.localize('theia/ai/chat-ui/contextNone', 'No ctx');
    return { total, files, images, invalid, warnings, label, shortLabel };
}

function countGenericCapabilitySelections(selections: GenericCapabilitySelections): number {
    return Object.values(selections).reduce((count, selected) => count + (selected?.length ?? 0), 0);
}

const ChatInputStatusBar: React.FunctionComponent<{
    isEnabled?: boolean;
    pending: boolean;
    contextSummary: ChatContextSummary;
    activeCapabilityCount: number;
    hasUnsavedCapabilityChanges: boolean;
}> = ({
    isEnabled,
    pending,
    contextSummary,
    activeCapabilityCount,
    hasUnsavedCapabilityChanges
}) => {
    const statusText = !isEnabled
        ? nls.localize('theia/ai/chat-ui/inputStatusDisabled', 'AI unavailable')
        : pending
            ? nls.localize('theia/ai/chat-ui/inputStatusWaiting', 'Waiting for response')
            : nls.localize('theia/ai/chat-ui/inputStatusReady', 'Ready');
    const statusDetail = !isEnabled
        ? nls.localize('theia/ai/chat-ui/inputStatusDisabledDetail', 'Enable AI features before sending.')
        : pending
            ? nls.localize('theia/ai/chat-ui/inputStatusWaitingDetail', 'Press Esc or use Stop to cancel.')
            : contextSummary.total > 0
                ? contextSummary.label
                : nls.localize('theia/ai/chat-ui/inputStatusNoContext', 'No context attached');
    const capabilityLabel = activeCapabilityCount > 0
        ? nls.localize('theia/ai/chat-ui/activeCapabilitiesCount', '{0} active', activeCapabilityCount)
        : nls.localize('theia/ai/chat-ui/noActiveCapabilities', 'Defaults');

    return (
        <div className={`theia-ChatInput-StatusBar${pending ? ' pending' : ''}${!isEnabled ? ' disabled' : ''}`}>
            <div className="theia-ChatInput-StatusPrimary">
                <span className={`codicon ${pending ? 'codicon-loading codicon-modifier-spin' : !isEnabled ? 'codicon-warning' : 'codicon-pass'}`} />
                <span className="theia-ChatInput-StatusText">{statusText}</span>
                <span className="theia-ChatInput-StatusDetail">{statusDetail}</span>
            </div>
            <div className="theia-ChatInput-StatusPills">
                <span className={`theia-ChatInput-StatePill${contextSummary.total > 0 ? ' active' : ''}${contextSummary.invalid > 0 ? ' error' : ''}`}>
                    <span className="codicon codicon-references" />
                    <span>{contextSummary.shortLabel}</span>
                </span>
                <span className={`theia-ChatInput-StatePill${activeCapabilityCount > 0 ? ' active' : ''}${hasUnsavedCapabilityChanges ? ' unsaved' : ''}`}>
                    <span className="codicon codicon-tools" />
                    <span>{capabilityLabel}</span>
                </span>
            </div>
        </div>
    );
};

function hoverHandler(hoverService: HoverService, content: string | MarkdownString, position: 'top' | 'bottom' = 'bottom'): (e: React.MouseEvent) => void {
    return (e: React.MouseEvent) => {
        hoverService.requestHover({
            content,
            target: e.currentTarget as HTMLElement,
            position
        });
    };
}

const QuickCommandBar: React.FunctionComponent<{
    commands: QuickCommand[];
    disabled: boolean;
    onInsert: (commandName: string) => void;
    hoverService: HoverService;
}> = ({ commands, disabled, onInsert, hoverService }) => (
    <div className="theia-ChatInput-QuickCommands" aria-label={nls.localize('theia/ai/chat-ui/quickCommands', 'Quick Commands')}>
        <span className="theia-ChatInput-QuickCommandsLabel">
            {nls.localize('theia/ai/chat-ui/quickCommandsLabel', 'Quick')}
        </span>
        {commands.map(command => {
            const title = command.description ? `/${command.name} - ${command.description}` : `/${command.name}`;
            return (
                <button
                    key={command.name}
                    type="button"
                    className="theia-ChatInput-QuickCommand"
                    disabled={disabled}
                    onClick={() => onInsert(command.name)}
                    onMouseEnter={hoverHandler(hoverService, title)}
                >
                    <span className="codicon codicon-terminal" />
                    <span>/{command.name}</span>
                </button>
            );
        })}
    </div>
);

export const qaapChatInputProductChrome: ChatInputProductChrome = {
    renderEditorBoxHeader(context: ChatInputProductChromeContext): React.ReactNode {
        const contextSummary = buildContextSummary(context.context);
        const activeGenericCapabilities = countGenericCapabilitySelections(context.genericCapabilities);
        return (
            <ChatInputStatusBar
                isEnabled={context.isEnabled}
                pending={context.pending}
                contextSummary={contextSummary}
                activeCapabilityCount={context.capabilityOverrideCount + activeGenericCapabilities}
                hasUnsavedCapabilityChanges={context.hasUnsavedCapabilityChanges}
            />
        );
    },
    renderBeforeOptions(context: ChatInputProductChromeContext): React.ReactNode {
        const quickCommands = buildQuickCommands(context.quickCommands, context.receivingAgentId);
        if (quickCommands.length === 0 || context.pending) {
            return undefined;
        }
        return (
            <QuickCommandBar
                commands={quickCommands}
                disabled={!context.isEnabled}
                onInsert={context.onInsertQuickCommand}
                hoverService={context.hoverService}
            />
        );
    },
};
