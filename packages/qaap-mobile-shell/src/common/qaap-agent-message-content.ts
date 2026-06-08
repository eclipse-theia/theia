// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

interface AgentContentBlock {
    readonly type?: string;
    readonly text?: unknown;
    readonly content?: unknown;
}

interface AgentMessageLike {
    readonly role?: string;
    readonly type?: string;
    readonly content?: unknown;
    readonly message?: {
        readonly content?: unknown;
    };
}

/**
 * Some CLIs persist OpenAI/Responses-style message JSON in stdout. The chat UI should render the
 * human text, while still leaving arbitrary JSON visible when it is genuinely the user's content.
 */
export function normalizeAgentMessageContentForDisplay(raw: string | undefined | null): string {
    const text = raw ?? '';
    const trimmed = text.trim();
    if (!looksLikeJson(trimmed)) {
        return text;
    }
    const extracted = extractDisplayTextFromJsonString(trimmed);
    return extracted ?? text;
}

type MessagePreviewLike = {
    readonly content?: string | null;
    readonly segments?: ReadonlyArray<{
        readonly type: string;
        readonly content?: string;
    }>;
};

/** Plain preview text for list rows — never throws when {@link content} is missing. */
export function resolveMessagePreviewText(message: MessagePreviewLike | undefined): string {
    if (!message) {
        return '';
    }
    const normalized = normalizeAgentMessageContentForDisplay(message.content);
    const trimmed = normalized.trim();
    if (trimmed && trimmed !== '…') {
        return trimmed;
    }
    for (const segment of [...(message.segments ?? [])].reverse()) {
        if (segment.type === 'text' && segment.content?.trim()) {
            return segment.content.trim();
        }
    }
    return trimmed;
}

function looksLikeJson(text: string): boolean {
    return (text.startsWith('{') && text.endsWith('}'))
        || (text.startsWith('[') && text.endsWith(']'))
        || (text.startsWith('"') && text.endsWith('"'));
}

function extractDisplayTextFromJsonString(text: string): string | undefined {
    try {
        return extractDisplayText(JSON.parse(text), 0);
    } catch {
        return undefined;
    }
}

function extractDisplayText(value: unknown, depth: number): string | undefined {
    if (depth > 3) {
        return undefined;
    }
    if (typeof value === 'string') {
        return looksLikeJson(value.trim()) ? extractDisplayTextFromJsonString(value.trim()) : value;
    }
    if (Array.isArray(value)) {
        return joinExtracted(value.map(item => extractDisplayText(item, depth + 1)));
    }
    if (!isRecord(value)) {
        return undefined;
    }
    const block = value as AgentContentBlock;
    if (typeof block.text === 'string' && isTextBlockType(block.type)) {
        return block.text;
    }
    if (typeof block.content === 'string' && isTextBlockType(block.type)) {
        return block.content;
    }
    const message = value as AgentMessageLike;
    const content = message.message?.content ?? message.content;
    if (content !== undefined && isMessageLike(message)) {
        return extractDisplayText(content, depth + 1);
    }
    return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isTextBlockType(type: string | undefined): boolean {
    return !type || type === 'text' || type === 'input_text' || type === 'output_text';
}

function isMessageLike(value: AgentMessageLike): boolean {
    return typeof value.role === 'string'
        || value.type === 'message'
        || value.type === 'assistant'
        || value.type === 'user'
        || !!value.message;
}

function joinExtracted(parts: Array<string | undefined>): string | undefined {
    const text = parts
        .map(part => part?.trim())
        .filter((part): part is string => !!part)
        .join('\n\n');
    return text || undefined;
}
