// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentMessageSegment } from './qaap-qaiq-stream';
import { normalizeQaiqToolName } from './qaap-qaiq-stream';

interface CodexStreamItem {
    readonly id?: string;
    readonly type?: string;
    readonly item_type?: string;
    readonly text?: string;
    readonly command?: string;
    readonly status?: string;
    readonly output?: string;
    readonly stdout?: string;
    readonly stderr?: string;
}

interface CodexStreamEvent {
    readonly type?: string;
    readonly item?: CodexStreamItem;
    readonly msg?: {
        readonly type?: string;
        readonly content?: string;
    };
    readonly error?: { readonly message?: string };
}

/**
 * Incrementally parses {@code codex exec --json} NDJSON into chat segments.
 */
export class QaapCodexStreamAccumulator {

    protected buffer = '';
    protected segments: QaapAgentMessageSegment[] = [];
    protected readonly itemsById = new Map<string, number>();
    protected jsonEvents = 0;

    push(chunk: string): readonly QaapAgentMessageSegment[] {
        if (!chunk) {
            return this.segments;
        }
        this.buffer += chunk;
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() ?? '';
        for (const line of lines) {
            this.consumeLine(line.trim());
        }
        return this.segments;
    }

    getSegments(): readonly QaapAgentMessageSegment[] {
        return this.segments;
    }

    consumedJsonEvents(): boolean {
        return this.jsonEvents > 0;
    }

    getDisplayText(): string {
        const parts: string[] = [];
        for (const segment of this.segments) {
            if (segment.type === 'text' && segment.content.trim()) {
                parts.push(segment.content.trim());
            } else if (segment.type === 'thinking' && segment.content.trim()) {
                parts.push(`[thinking] ${segment.content.trim()}`);
            } else if (segment.type === 'tool') {
                parts.push(`[tool ${segment.finished ? 'done' : 'running'}] ${segment.name}`);
            }
        }
        return parts.join('\n\n');
    }

    protected consumeLine(line: string): void {
        if (!line) {
            return;
        }
        let envelope: CodexStreamEvent;
        try {
            envelope = JSON.parse(line) as CodexStreamEvent;
        } catch {
            return;
        }
        this.jsonEvents += 1;
        if (envelope.msg?.type === 'text' && envelope.msg.content?.trim()) {
            this.appendText(envelope.msg.content);
            return;
        }
        if (envelope.error?.message?.trim()) {
            this.appendText(`\n\n**Error:** ${envelope.error.message.trim()}`);
            return;
        }
        const eventType = envelope.type ?? '';
        const item = envelope.item;
        if (!item) {
            return;
        }
        const itemType = item.type ?? item.item_type ?? '';
        const itemId = item.id ?? `codex-${this.segments.length}`;
        if (eventType === 'item.started' || (eventType === 'item.updated' && item.status === 'in_progress')) {
            this.consumeItemStarted(itemId, itemType, item);
            return;
        }
        if (eventType === 'item.completed' || eventType === 'item.updated') {
            this.consumeItemCompleted(itemId, itemType, item);
        }
    }

    protected consumeItemStarted(itemId: string, itemType: string, item: CodexStreamItem): void {
        if (isCodexReasoningItem(itemType)) {
            if (item.text?.trim()) {
                this.appendThinking(item.text);
            }
            return;
        }
        if (isCodexToolItem(itemType)) {
            const name = classifyCodexToolName(itemType, item);
            const args = buildCodexToolArgs(itemType, item);
            this.upsertTool(itemId, name, args, false);
        }
    }

    protected consumeItemCompleted(itemId: string, itemType: string, item: CodexStreamItem): void {
        if (isCodexMessageItem(itemType)) {
            if (item.text?.trim()) {
                this.appendText(item.text);
            }
            return;
        }
        if (isCodexReasoningItem(itemType)) {
            if (item.text?.trim()) {
                this.appendThinking(item.text);
            }
            return;
        }
        if (isCodexToolItem(itemType)) {
            const name = classifyCodexToolName(itemType, item);
            const args = buildCodexToolArgs(itemType, item);
            const result = extractCodexToolResult(item);
            this.upsertTool(itemId, name, args, true, result);
        }
    }

    protected appendText(text: string): void {
        if (!text) {
            return;
        }
        const last = this.segments[this.segments.length - 1];
        if (last?.type === 'text') {
            this.segments[this.segments.length - 1] = { type: 'text', content: last.content + text };
            return;
        }
        this.segments.push({ type: 'text', content: text });
    }

    protected appendThinking(text: string): void {
        if (!text) {
            return;
        }
        const last = this.segments[this.segments.length - 1];
        if (last?.type === 'thinking') {
            this.segments[this.segments.length - 1] = { type: 'thinking', content: last.content + text };
            return;
        }
        this.segments.push({ type: 'thinking', content: text });
    }

    protected upsertTool(
        toolUseId: string,
        name: string,
        args: string,
        finished: boolean,
        result?: string,
    ): void {
        const existingIndex = this.itemsById.get(toolUseId);
        const segment: QaapAgentMessageSegment = result !== undefined
            ? { type: 'tool', toolUseId, name, args, finished, result }
            : { type: 'tool', toolUseId, name, args, finished };
        if (existingIndex !== undefined) {
            this.segments[existingIndex] = segment;
            return;
        }
        this.itemsById.set(toolUseId, this.segments.length);
        this.segments.push(segment);
    }
}

export function parseCodexLog(log: string): { content: string; segments: QaapAgentMessageSegment[] } {
    const acc = new QaapCodexStreamAccumulator();
    acc.push(log);
    if (acc.consumedJsonEvents()) {
        const segments = [...acc.getSegments()];
        return { content: acc.getDisplayText() || log.trim(), segments };
    }
    return { content: log.trim(), segments: [] };
}

function isCodexMessageItem(itemType: string): boolean {
    return itemType === 'agent_message' || itemType === 'assistant_message';
}

function isCodexReasoningItem(itemType: string): boolean {
    return itemType === 'reasoning' || itemType === 'reasoning_text';
}

function isCodexToolItem(itemType: string): boolean {
    return itemType === 'command_execution'
        || itemType === 'shell_command'
        || itemType === 'file_change'
        || itemType === 'apply_patch'
        || itemType === 'mcp_tool_call'
        || itemType === 'web_search'
        || itemType === 'tool_call';
}

function classifyCodexToolName(itemType: string, item: CodexStreamItem): string {
    if (itemType === 'command_execution' || itemType === 'shell_command') {
        return 'Bash';
    }
    if (itemType === 'file_change' || itemType === 'apply_patch') {
        return 'Edit';
    }
    if (itemType === 'web_search') {
        return 'WebSearch';
    }
    return normalizeQaiqToolName(itemType.replace(/_/g, ' '));
}

function buildCodexToolArgs(itemType: string, item: CodexStreamItem): string {
    if (item.command?.trim()) {
        return JSON.stringify({ command: item.command.trim() });
    }
    if (item.text?.trim()) {
        return JSON.stringify({ detail: item.text.trim() });
    }
    return JSON.stringify({ type: itemType });
}

function extractCodexToolResult(item: CodexStreamItem): string | undefined {
    const output = item.output ?? item.stdout ?? item.stderr;
    return typeof output === 'string' && output.trim() ? output.trim() : undefined;
}
