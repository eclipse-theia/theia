// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentMessageSegment } from './qaap-qaiq-stream';
import { normalizeQaiqToolName } from './qaap-qaiq-stream';

interface OpencodeToolPart {
    readonly id?: string;
    readonly type?: string;
    readonly tool?: string;
    readonly input?: Record<string, unknown>;
    readonly text?: string;
    readonly state?: {
        readonly status?: string;
        readonly error?: string;
        readonly output?: string;
        readonly stdout?: string;
    };
}

interface OpencodeStreamEvent {
    readonly type?: string;
    readonly part?: OpencodeToolPart;
}

/** Matches OpenCode default (non-json) CLI tool lines, e.g. `→ Read path` or `$ npm test`. */
const OPENCODE_FORMATTED_TOOL_LINE = /^(?:→|✱|⎔|⚙|⌁|\$)\s+/u;

const OPENCODE_FORMATTED_HEADER_LINE = /^>\s+/;

/**
 * Incrementally parses OpenCode {@code opencode run --format json} NDJSON into chat segments.
 * Falls back to {@link parseOpencodeFormattedLog} when the log is plain formatted CLI output.
 */
export class QaapOpencodeStreamAccumulator {

    protected buffer = '';
    protected segments: QaapAgentMessageSegment[] = [];
    protected readonly toolsById = new Map<string, number>();
    /** True when at least one line was a valid OpenCode JSON event. */
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
        let envelope: OpencodeStreamEvent;
        try {
            envelope = JSON.parse(line) as OpencodeStreamEvent;
        } catch {
            return;
        }
        if (!envelope.type) {
            return;
        }
        this.jsonEvents += 1;
        switch (envelope.type) {
            case 'text':
                if (envelope.part?.text?.trim()) {
                    this.appendText(envelope.part.text);
                }
                break;
            case 'reasoning':
                if (envelope.part?.text?.trim()) {
                    this.appendThinking(envelope.part.text);
                }
                break;
            case 'tool_use':
                this.consumeToolPart(envelope.part);
                break;
            default:
                break;
        }
    }

    protected consumeToolPart(part: OpencodeToolPart | undefined): void {
        if (!part || part.type !== 'tool' || !part.tool) {
            return;
        }
        const toolUseId = part.id ?? `opencode-${this.segments.length}`;
        const name = normalizeQaiqToolName(part.tool);
        const args = JSON.stringify(part.input ?? {});
        const status = part.state?.status;
        const finished = status === 'completed' || status === 'error' || status === undefined;
        const result = extractOpencodeToolResult(part.state);
        this.upsertTool(toolUseId, name, args, finished, result);
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
        const existingIndex = this.toolsById.get(toolUseId);
        const segment: QaapAgentMessageSegment = result !== undefined
            ? { type: 'tool', toolUseId, name, args, finished, result }
            : { type: 'tool', toolUseId, name, args, finished };
        if (existingIndex !== undefined) {
            this.segments[existingIndex] = segment;
            return;
        }
        this.toolsById.set(toolUseId, this.segments.length);
        this.segments.push(segment);
    }
}

function extractOpencodeToolResult(state: OpencodeToolPart['state']): string | undefined {
    if (!state) {
        return undefined;
    }
    if (typeof state.error === 'string' && state.error.trim()) {
        return `Error: ${state.error.trim()}`;
    }
    if (typeof state.output === 'string' && state.output.trim()) {
        return state.output;
    }
    if (typeof state.stdout === 'string' && state.stdout.trim()) {
        return state.stdout;
    }
    return undefined;
}

/**
 * Parses a full OpenCode log: JSON NDJSON when present, otherwise formatted CLI output.
 */
export function parseOpencodeLog(log: string): { content: string; segments: QaapAgentMessageSegment[] } {
    const jsonAcc = new QaapOpencodeStreamAccumulator();
    jsonAcc.push(log);
    if (jsonAcc.consumedJsonEvents()) {
        const segments = [...jsonAcc.getSegments()];
        return { content: jsonAcc.getDisplayText() || log, segments };
    }
    return parseOpencodeFormattedLog(log);
}

/**
 * Parses default OpenCode CLI output (`→ Read …`, `$ bash …`, then assistant prose).
 */
export function parseOpencodeFormattedLog(log: string): { content: string; segments: QaapAgentMessageSegment[] } {
    const lines = log.replace(/\r\n/g, '\n').split('\n');
    const segments: QaapAgentMessageSegment[] = [];
    const textLines: string[] = [];
    let toolIndex = 0;

    const flushText = (): void => {
        const content = textLines.join('\n').trim();
        textLines.length = 0;
        if (!content) {
            return;
        }
        const last = segments[segments.length - 1];
        if (last?.type === 'text') {
            segments[segments.length - 1] = { type: 'text', content: `${last.content}\n\n${content}` };
            return;
        }
        segments.push({ type: 'text', content });
    };

    const pushTool = (name: string, args: string, result?: string): void => {
        flushText();
        const toolUseId = `opencode-fmt-${toolIndex++}`;
        segments.push(result !== undefined
            ? { type: 'tool', toolUseId, name, args, finished: true, result }
            : { type: 'tool', toolUseId, name, args, finished: true });
    };

    let index = 0;
    while (index < lines.length) {
        const line = lines[index];
        const trimmed = line.trim();
        if (!trimmed || OPENCODE_FORMATTED_HEADER_LINE.test(trimmed)) {
            index += 1;
            continue;
        }
        if (OPENCODE_FORMATTED_TOOL_LINE.test(trimmed)) {
            if (trimmed.startsWith('$')) {
                const command = trimmed.slice(1).trim();
                index += 1;
                const output: string[] = [];
                while (index < lines.length) {
                    const next = lines[index].trim();
                    if (!next) {
                        const peek = lines[index + 1]?.trim() ?? '';
                        if (peek && !OPENCODE_FORMATTED_TOOL_LINE.test(peek) && !OPENCODE_FORMATTED_HEADER_LINE.test(peek)) {
                            break;
                        }
                        index += 1;
                        continue;
                    }
                    if (OPENCODE_FORMATTED_TOOL_LINE.test(next) || OPENCODE_FORMATTED_HEADER_LINE.test(next)) {
                        break;
                    }
                    output.push(lines[index]);
                    index += 1;
                }
                pushTool('Bash', JSON.stringify({ command }), output.join('\n').trim() || undefined);
                continue;
            }
            const { name, args } = classifyOpencodeFormattedToolLine(trimmed);
            pushTool(name, args);
            index += 1;
            continue;
        }
        textLines.push(line);
        index += 1;
    }
    flushText();

    const display = segments
        .filter((segment): segment is Extract<QaapAgentMessageSegment, { type: 'text' }> => segment.type === 'text')
        .map(segment => segment.content.trim())
        .filter(Boolean)
        .join('\n\n');
    return { content: display || log.trim(), segments };
}

function classifyOpencodeFormattedToolLine(line: string): { name: string; args: string } {
    const body = line.replace(/^(?:→|✱|⎔|⚙|⌁)\s+/u, '').trim();
    const readMatch = /^Read\s+(.+)$/i.exec(body);
    if (readMatch) {
        return { name: 'Read', args: JSON.stringify({ file_path: readMatch[1] }) };
    }
    const listMatch = /^List(?:\s+(.+))?$/i.exec(body);
    if (listMatch) {
        return { name: 'Glob', args: JSON.stringify({ path: listMatch[1] ?? '.' }) };
    }
    const editMatch = /^Edit\s+(.+)$/i.exec(body);
    if (editMatch) {
        return { name: 'Edit', args: JSON.stringify({ file_path: editMatch[1] }) };
    }
    const writeMatch = /^Write\s+(.+)$/i.exec(body);
    if (writeMatch) {
        return { name: 'Write', args: JSON.stringify({ file_path: writeMatch[1] }) };
    }
    const grepMatch = /^Grep\s+(.+)$/i.exec(body);
    if (grepMatch) {
        return { name: 'Grep', args: JSON.stringify({ pattern: grepMatch[1] }) };
    }
    const globMatch = /^Glob\s+(.+)$/i.exec(body);
    if (globMatch) {
        return { name: 'Glob', args: JSON.stringify({ pattern: globMatch[1] }) };
    }
    const bashMatch = /^Bash\s+(.+)$/i.exec(body);
    if (bashMatch) {
        return { name: 'Bash', args: JSON.stringify({ command: bashMatch[1] }) };
    }
    return { name: 'Tool', args: JSON.stringify({ title: body }) };
}
