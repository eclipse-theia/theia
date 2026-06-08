// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { type ClaudeStreamUsageLike, type QaapAgentContextUsage, usageFromClaudeStream } from './qaap-agent-context-usage';

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
        readonly usage?: ClaudeStreamUsageLike;
    };
    readonly usage?: ClaudeStreamUsageLike;
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

interface ToolResultState {
    readonly result: string;
    readonly isError: boolean;
}

/**
 * Incrementally parses QAIQ / Claude Code {@code --output-format stream-json} NDJSON.
 *
 * Canonical model: assistant snapshots append to an ordered block list; segments are always
 * rebuilt from that list (plus optional live stream_event overlay). That avoids replay
 * duplicates from mixing incremental stdout chunks with snapshot re-emits.
 */
export class QaapQaiqStreamAccumulator {

    protected buffer = '';
    protected segments: QaapAgentMessageSegment[] = [];
    /** Ordered assistant content blocks accumulated from timestamped snapshots. */
    protected transcriptBlocks: ContentBlock[] = [];
    protected readonly toolResults = new Map<string, ToolResultState>();
    protected liveText = '';
    protected liveThinking = '';
    /** When true, ignore assistant snapshots without {@code timestamp_ms} (buffered flushes). */
    protected sawTimestampedAssistant = false;
    protected readonly toolsById = new Map<string, number>();
    /** Latest usage reported for the in-flight turn (assistant snapshot or final result). */
    protected turnUsage: QaapAgentContextUsage | undefined;

    getTurnUsage(): QaapAgentContextUsage | undefined {
        return this.turnUsage;
    }

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
            this.captureUsage(envelope.message?.usage);
            this.handleTranscriptMessage(envelope);
            return;
        }
        if (type === 'result') {
            this.captureUsage(envelope.usage);
            if (envelope.is_error && typeof envelope.result === 'string' && envelope.result.trim()) {
                this.liveText = mergeIncrementalStreamText(this.liveText, `\n\n**Error:** ${envelope.result.trim()}`);
                this.rebuildSegments();
            }
        }
    }

    protected captureUsage(usage: ClaudeStreamUsageLike | undefined): void {
        const parsed = usageFromClaudeStream(usage);
        if (parsed) {
            this.turnUsage = parsed;
        }
    }

    protected handleStreamEvent(envelope: StreamMessageEnvelope): void {
        const delta = envelope.event?.delta;
        if (!delta?.type) {
            return;
        }
        if (delta.type === 'text_delta' && delta.text) {
            this.liveText = mergeIncrementalStreamText(this.liveText, delta.text);
            this.rebuildSegments();
        } else if (delta.type === 'thinking_delta' && delta.thinking) {
            this.liveThinking = mergeIncrementalStreamText(this.liveThinking, delta.thinking);
            this.rebuildSegments();
        }
    }

    protected handleTranscriptMessage(envelope: StreamMessageEnvelope): void {
        if (envelope.type === 'assistant') {
            if (envelope.timestamp_ms !== undefined) {
                this.sawTimestampedAssistant = true;
            } else if (this.sawTimestampedAssistant) {
                return;
            }
            const raw = envelope.message?.content;
            if (!raw) {
                return;
            }
            const blocks = typeof raw === 'string' ? [{ type: 'text', text: raw }] : raw;
            if (!Array.isArray(blocks)) {
                return;
            }
            this.ingestAssistantSnapshot(blocks);
            this.liveText = '';
            this.liveThinking = '';
            this.rebuildSegments();
            return;
        }
        const raw = envelope.message?.content;
        if (!raw) {
            return;
        }
        const blocks = typeof raw === 'string' ? [{ type: 'text', text: raw }] : raw;
        if (!Array.isArray(blocks)) {
            return;
        }
        let changed = false;
        for (const block of blocks) {
            if (block.type === 'tool_result' && block.tool_use_id) {
                const result = typeof block.content === 'string'
                    ? block.content
                    : JSON.stringify(block.content ?? '');
                this.toolResults.set(block.tool_use_id, { result, isError: !!block.is_error });
                changed = true;
            }
        }
        if (changed) {
            this.rebuildSegments();
        }
    }

    /** Merge one assistant snapshot into the canonical block list (source of truth). */
    protected ingestAssistantSnapshot(blocks: readonly ContentBlock[]): void {
        for (const block of blocks) {
            switch (block.type) {
                case 'text':
                    if (block.text) {
                        this.ingestAssistantTextBlock(block.text);
                    }
                    break;
                case 'thinking':
                    if (block.thinking) {
                        this.ingestAssistantThinkingBlock(block.thinking);
                    }
                    break;
                case 'redacted_thinking':
                    if (block.data) {
                        this.ingestAssistantThinkingBlock(block.data);
                    }
                    break;
                case 'tool_use':
                case 'server_tool_use':
                    if (block.id && block.name) {
                        this.upsertTranscriptToolBlock(block);
                    }
                    break;
                default:
                    break;
            }
        }
    }

    protected ingestAssistantTextBlock(text: string): void {
        const priorText = collectTextFromTranscriptBlocks(this.transcriptBlocks);
        const trimmed = text.trim();
        if (!trimmed) {
            return;
        }
        if (!priorText) {
            this.transcriptBlocks.push({ type: 'text', text: trimmed });
            return;
        }
        if (trimmed === priorText || text === priorText) {
            return;
        }
        if (trimmed.startsWith(priorText) && trimmed.length > priorText.length) {
            const suffix = trimmed.slice(priorText.length);
            if (/^\s*\n/.test(suffix)) {
                const remainder = stripLeadingParagraphsInPriorText(trimmed, priorText);
                if (remainder) {
                    this.transcriptBlocks.push({ type: 'text', text: remainder });
                }
                return;
            }
            this.consolidateTranscriptText(trimmed);
            return;
        }
        const stripped = stripLeadingParagraphsInPriorText(trimmed, priorText);
        if (!stripped) {
            return;
        }
        const last = this.transcriptBlocks[this.transcriptBlocks.length - 1];
        if (last?.type === 'text' && last.text && this.isInlineTextContinuation(last.text, text)) {
            this.transcriptBlocks[this.transcriptBlocks.length - 1] = {
                type: 'text',
                text: last.text + text,
            };
            return;
        }
        this.transcriptBlocks.push({ type: 'text', text: stripped });
    }

    protected ingestAssistantThinkingBlock(text: string): void {
        const last = this.transcriptBlocks[this.transcriptBlocks.length - 1];
        if (last?.type === 'thinking' && last.thinking) {
            const merged = mergeIncrementalStreamText(last.thinking, text);
            if (merged === last.thinking) {
                return;
            }
            this.transcriptBlocks[this.transcriptBlocks.length - 1] = { type: 'thinking', thinking: merged };
            return;
        }
        this.transcriptBlocks.push({ type: 'thinking', thinking: text });
    }

    protected upsertTranscriptToolBlock(block: ContentBlock): void {
        const index = this.transcriptBlocks.findIndex(entry =>
            (entry.type === 'tool_use' || entry.type === 'server_tool_use') && entry.id === block.id);
        if (index >= 0) {
            this.transcriptBlocks[index] = block;
            return;
        }
        this.transcriptBlocks.push(block);
    }

    protected consolidateTranscriptText(text: string): void {
        let replaced = false;
        this.transcriptBlocks = this.transcriptBlocks.flatMap(block => {
            if (block.type === 'text') {
                if (!replaced) {
                    replaced = true;
                    return [{ type: 'text', text }];
                }
                return [];
            }
            return [block];
        });
        if (!replaced) {
            this.transcriptBlocks.unshift({ type: 'text', text });
        }
    }

    protected isInlineTextContinuation(existing: string, incoming: string): boolean {
        return incoming.startsWith(' ')
            || (!incoming.includes('\n\n') && incoming.length <= 96);
    }

    protected rebuildSegments(): void {
        const segments: QaapAgentMessageSegment[] = [];
        let pendingText = '';
        let pendingThinking = '';

        const flushText = (): void => {
            const normalized = collapseConsecutiveDuplicateParagraphs(pendingText.trim());
            if (normalized) {
                segments.push({ type: 'text', content: normalized });
            }
            pendingText = '';
        };
        const flushThinking = (): void => {
            const normalized = pendingThinking.trim();
            if (normalized) {
                segments.push({ type: 'thinking', content: normalized });
            }
            pendingThinking = '';
        };

        for (const block of this.transcriptBlocks) {
            switch (block.type) {
                case 'text':
                    pendingText = pendingText
                        ? mergeIncrementalStreamText(pendingText, block.text ?? '')
                        : (block.text ?? '');
                    break;
                case 'thinking':
                    flushText();
                    pendingThinking = pendingThinking
                        ? mergeIncrementalStreamText(pendingThinking, block.thinking ?? '')
                        : (block.thinking ?? '');
                    break;
                case 'redacted_thinking':
                    flushText();
                    pendingThinking = pendingThinking
                        ? mergeIncrementalStreamText(pendingThinking, block.data ?? '')
                        : (block.data ?? '');
                    break;
                case 'tool_use':
                case 'server_tool_use':
                    flushText();
                    flushThinking();
                    if (block.id && block.name) {
                        segments.push(this.buildToolSegment(block.id, block.name, JSON.stringify(block.input ?? {})));
                    }
                    break;
                default:
                    break;
            }
        }
        flushText();
        flushThinking();

        if (this.liveThinking.trim()) {
            segments.push({ type: 'thinking', content: this.liveThinking.trim() });
        }
        if (this.liveText) {
            const last = segments[segments.length - 1];
            if (last?.type === 'text') {
                const merged = mergeIncrementalStreamText(last.content, this.liveText);
                if (merged !== last.content) {
                    segments[segments.length - 1] = { type: 'text', content: merged };
                }
            } else {
                const normalized = collapseConsecutiveDuplicateParagraphs(this.liveText.trim());
                if (normalized) {
                    segments.push({ type: 'text', content: normalized });
                }
            }
        }

        this.segments = dedupeAgentMessageTextSegments(segments);
        this.toolsById.clear();
        for (let index = 0; index < this.segments.length; index++) {
            const segment = this.segments[index];
            if (segment.type === 'tool') {
                this.toolsById.set(segment.toolUseId, index);
            }
        }
    }

    protected buildToolSegment(toolUseId: string, name: string, args: string): QaapAgentMessageSegment {
        const normalizedName = normalizeQaiqToolName(name);
        const resultState = this.toolResults.get(toolUseId);
        if (resultState) {
            return {
                type: 'tool',
                toolUseId,
                name: normalizedName,
                args,
                finished: true,
                result: resultState.isError ? `Error: ${resultState.result}` : resultState.result,
            };
        }
        return { type: 'tool', toolUseId, name: normalizedName, args, finished: false };
    }
}

/**
 * Merge streaming assistant/thinking text: append token deltas, adopt cumulative snapshots,
 * skip exact duplicates and shorter replays.
 */
export function mergeIncrementalStreamText(existing: string, incoming: string): string {
    if (!incoming) {
        return existing;
    }
    if (!existing) {
        return incoming;
    }
    if (incoming === existing) {
        return existing;
    }
    if (incoming === existing + existing) {
        return existing;
    }
    if (incoming.startsWith(existing)) {
        return incoming;
    }
    if (existing.startsWith(incoming)) {
        return existing;
    }
    return existing + incoming;
}

/** Remove back-to-back duplicate paragraphs inside one streamed text block. */
export function collapseConsecutiveDuplicateParagraphs(text: string): string {
    const paragraphs = text.split(/\n\n+/).map(part => part.trim()).filter(Boolean);
    if (paragraphs.length <= 1) {
        return text.trim();
    }
    const deduped: string[] = [];
    for (const paragraph of paragraphs) {
        if (deduped.length > 0 && deduped[deduped.length - 1] === paragraph) {
            continue;
        }
        deduped.push(paragraph);
    }
    return deduped.join('\n\n');
}

function collectTextFromTranscriptBlocks(blocks: readonly ContentBlock[]): string {
    const parts: string[] = [];
    for (const block of blocks) {
        if (block.type === 'text' && block.text?.trim()) {
            parts.push(block.text.trim());
        }
    }
    return parts.join('\n\n');
}

function collectAgentMessageText(segments: readonly QaapAgentMessageSegment[]): string {
    const parts: string[] = [];
    for (const segment of segments) {
        if (segment.type === 'text' && segment.content.trim()) {
            parts.push(segment.content.trim());
        }
    }
    return parts.join('\n\n');
}

function paragraphAlreadyInPriorText(priorText: string, paragraph: string): boolean {
    if (!paragraph) {
        return true;
    }
    if (priorText === paragraph || priorText.endsWith(paragraph)) {
        return true;
    }
    return priorText.split(/\n\n+/).some(part => part.trim() === paragraph);
}

/** Drop replayed paragraphs when QAIQ re-emits earlier prose after a tool call. */
export function stripLeadingParagraphsInPriorText(text: string, priorText: string): string | undefined {
    const trimmed = text.trim();
    if (!trimmed) {
        return undefined;
    }
    if (!priorText.trim()) {
        return trimmed;
    }
    const paragraphs = trimmed.split(/\n\n+/).map(part => part.trim()).filter(Boolean);
    let index = 0;
    while (index < paragraphs.length && paragraphAlreadyInPriorText(priorText, paragraphs[index])) {
        index += 1;
    }
    const remaining = paragraphs.slice(index);
    return remaining.length > 0 ? remaining.join('\n\n') : undefined;
}

/** Collapse replayed text segments while preserving tool/thinking order. */
export function dedupeAgentMessageTextSegments(
    segments: readonly QaapAgentMessageSegment[],
): QaapAgentMessageSegment[] {
    const result: QaapAgentMessageSegment[] = [];
    let priorText = '';

    for (const segment of segments) {
        if (segment.type !== 'text') {
            result.push(segment);
            continue;
        }

        let chunk = collapseConsecutiveDuplicateParagraphs(segment.content.trim());
        if (!chunk) {
            continue;
        }

        chunk = stripLeadingParagraphsInPriorText(chunk, priorText) ?? '';
        if (!chunk) {
            continue;
        }

        const last = result[result.length - 1];
        if (last?.type === 'text') {
            const merged = mergeIncrementalStreamText(last.content, chunk);
            if (merged === last.content) {
                priorText = collectAgentMessageText(result);
                continue;
            }
            if (merged.startsWith(last.content)) {
                result[result.length - 1] = { type: 'text', content: merged };
                priorText = collectAgentMessageText(result);
                continue;
            }
        }

        if (result.some(entry => entry.type === 'text' && entry.content.trim() === chunk)) {
            continue;
        }

        result.push({ type: 'text', content: chunk });
        priorText = collectAgentMessageText(result);
    }

    return result;
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
