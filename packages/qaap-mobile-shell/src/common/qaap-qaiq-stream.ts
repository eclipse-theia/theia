// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** One renderable block in a QAIQ / Claude Code stream-json transcript. */
export type QaapAgentMessageSegment =
    | { readonly type: 'text'; readonly content: string }
    | { readonly type: 'thinking'; readonly content: string }
    | {
        readonly type: 'tool';
        readonly toolUseId: string;
        readonly name: string;
        readonly args: string;
        readonly finished: boolean;
        readonly result?: string;
    };

interface ContentBlock {
    readonly type?: string;
    readonly text?: string;
    readonly thinking?: string;
    readonly data?: string;
    readonly id?: string;
    readonly name?: string;
    readonly input?: Record<string, unknown>;
    readonly tool_use_id?: string;
    readonly content?: unknown;
    readonly is_error?: boolean;
}

interface StreamMessageEnvelope {
    readonly type?: string;
    readonly timestamp_ms?: number;
    readonly message?: {
        readonly content?: ContentBlock[] | string;
    };
    readonly event?: {
        readonly type?: string;
        readonly delta?: {
            readonly type?: string;
            readonly text?: string;
            readonly thinking?: string;
        };
    };
    readonly result?: string;
    readonly is_error?: boolean;
}

/**
 * Incrementally parses QAIQ / Claude Code {@code --output-format stream-json} NDJSON into
 * chat segments (thinking, tool calls, assistant text).
 */
export class QaapQaiqStreamAccumulator {

    protected buffer = '';
    protected segments: QaapAgentMessageSegment[] = [];
    /** When true, ignore assistant snapshots without {@code timestamp_ms} (buffered flushes). */
    protected sawTimestampedAssistant = false;
    protected readonly toolsById = new Map<string, number>();

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

    /** Plain-text fallback for list previews and legacy consumers. */
    getDisplayText(): string {
        const parts: string[] = [];
        for (const segment of this.segments) {
            if (segment.type === 'text' && segment.content.trim()) {
                parts.push(segment.content.trim());
            } else if (segment.type === 'thinking' && segment.content.trim()) {
                parts.push(`[thinking] ${segment.content.trim()}`);
            } else if (segment.type === 'tool') {
                const status = segment.finished ? 'done' : 'running';
                parts.push(`[tool ${status}] ${segment.name}`);
            }
        }
        return parts.join('\n\n');
    }

    protected consumeLine(line: string): void {
        if (!line) {
            return;
        }
        let envelope: StreamMessageEnvelope;
        try {
            envelope = JSON.parse(line) as StreamMessageEnvelope;
        } catch {
            return;
        }
        const type = envelope.type;
        if (type === 'stream_event') {
            this.handleStreamEvent(envelope);
            return;
        }
        if (type === 'assistant' || type === 'user') {
            this.handleTranscriptMessage(envelope);
            return;
        }
        if (type === 'result' && envelope.is_error && typeof envelope.result === 'string' && envelope.result.trim()) {
            this.appendText(`\n\n**Error:** ${envelope.result.trim()}`);
        }
    }

    protected handleStreamEvent(envelope: StreamMessageEnvelope): void {
        const delta = envelope.event?.delta;
        if (!delta?.type) {
            return;
        }
        if (delta.type === 'text_delta' && delta.text) {
            this.appendText(delta.text);
        } else if (delta.type === 'thinking_delta' && delta.thinking) {
            this.appendThinking(delta.thinking);
        }
    }

    protected handleTranscriptMessage(envelope: StreamMessageEnvelope): void {
        if (envelope.type === 'assistant') {
            if (envelope.timestamp_ms !== undefined) {
                this.sawTimestampedAssistant = true;
            } else if (this.sawTimestampedAssistant) {
                return;
            }
        }
        const raw = envelope.message?.content;
        if (!raw) {
            return;
        }
        const blocks = typeof raw === 'string' ? [{ type: 'text', text: raw }] : raw;
        if (!Array.isArray(blocks)) {
            return;
        }
        for (const block of blocks) {
            this.consumeContentBlock(block);
        }
    }

    protected consumeContentBlock(block: ContentBlock): void {
        switch (block.type) {
            case 'text':
                if (block.text) {
                    this.appendText(block.text);
                }
                break;
            case 'thinking':
                if (block.thinking) {
                    this.appendThinking(block.thinking);
                }
                break;
            case 'redacted_thinking':
                if (block.data) {
                    this.appendThinking(block.data);
                }
                break;
            case 'tool_use':
            case 'server_tool_use':
                if (block.id && block.name) {
                    this.upsertTool(block.id, block.name, JSON.stringify(block.input ?? {}), false);
                }
                break;
            case 'tool_result':
                if (block.tool_use_id) {
                    const result = typeof block.content === 'string'
                        ? block.content
                        : JSON.stringify(block.content ?? '');
                    this.finishTool(block.tool_use_id, result, !!block.is_error);
                }
                break;
            default:
                break;
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

    protected upsertTool(toolUseId: string, name: string, args: string, finished: boolean, result?: string): void {
        const normalizedName = normalizeQaiqToolName(name);
        const existingIndex = this.toolsById.get(toolUseId);
        const segment: QaapAgentMessageSegment = result !== undefined
            ? { type: 'tool', toolUseId, name: normalizedName, args, finished, result }
            : { type: 'tool', toolUseId, name: normalizedName, args, finished };
        if (existingIndex !== undefined) {
            this.segments[existingIndex] = segment;
            return;
        }
        this.toolsById.set(toolUseId, this.segments.length);
        this.segments.push(segment);
    }

    protected finishTool(toolUseId: string, result: string, isError: boolean): void {
        const index = this.toolsById.get(toolUseId);
        if (index === undefined) {
            return;
        }
        const current = this.segments[index];
        if (current.type !== 'tool') {
            return;
        }
        this.segments[index] = {
            ...current,
            finished: true,
            result: isError ? `Error: ${result}` : result,
        };
    }
}

/** Claude Code renderers expect canonical tool ids (e.g. `Bash`, `Read`). */
const QAIQ_TOOL_NAME_MAP = new Map<string, string>([
    ['bash', 'Bash'],
    ['read', 'Read'],
    ['edit', 'Edit'],
    ['write', 'Write'],
    ['grep', 'Grep'],
    ['glob', 'Glob'],
]);

/** Claude Code renderers expect canonical tool ids (e.g. `Bash`, `Read`). */
export function normalizeQaiqToolName(name: string): string {
    return QAIQ_TOOL_NAME_MAP.get(name.toLowerCase()) ?? name;
}
