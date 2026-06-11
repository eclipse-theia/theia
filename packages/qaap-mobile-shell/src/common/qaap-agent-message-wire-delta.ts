// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentMessageDTO, QaapAgentMessageSegmentDTO } from './qaap-agent-conversation-client';
import { usesStructuredAgentTranscript } from './qaap-agent-task-client';
import type { QaapAgentWireCompressionEncoding } from './qaap-agent-wire-encoding';

/** Incremental wire ops for live agent transcript streaming (shared server + browser). */
export type QaapAgentMessageWireDelta =
    | { readonly kind: 'noop' }
    | { readonly kind: 'message_start'; readonly message: QaapAgentMessageDTO }
    | { readonly kind: 'replace'; readonly message: QaapAgentMessageDTO }
    | {
        readonly kind: 'append_content';
        readonly messageId: string;
        readonly text: string;
        readonly textEncoding?: QaapAgentWireCompressionEncoding;
    }
    | {
        readonly kind: 'append_segment_text';
        readonly messageId: string;
        readonly segmentIndex: number;
        readonly text: string;
        readonly textEncoding?: QaapAgentWireCompressionEncoding;
    }
    | {
        readonly kind: 'patch_tool';
        readonly messageId: string;
        readonly toolUseId: string;
        readonly argsAppend?: string;
        readonly argsAppendEncoding?: QaapAgentWireCompressionEncoding;
        readonly resultAppend?: string;
        readonly resultAppendEncoding?: QaapAgentWireCompressionEncoding;
        readonly finished?: boolean;
    }
    | {
        readonly kind: 'append_segment';
        readonly messageId: string;
        readonly segment: QaapAgentMessageSegmentDTO;
    };

export interface QaapAgentMessageWireSnapshot {
    readonly id: string;
    readonly role: 'user' | 'agent';
    readonly content: string;
    readonly segments?: QaapAgentMessageSegmentDTO[];
    readonly createdAt: number;
}

function toWireMessage(message: QaapAgentMessageWireSnapshot): QaapAgentMessageDTO {
    return {
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
        ...(message.segments ? { segments: [...message.segments] } : {}),
    };
}

function segmentFingerprint(segment: QaapAgentMessageSegmentDTO): string {
    if (segment.type === 'tool') {
        return `t:${segment.toolUseId}:${segment.finished ? '1' : '0'}:${segment.args?.length ?? 0}:${segment.result?.length ?? 0}:${segment.name}`;
    }
    return `${segment.type}:${segment.content ?? ''}`;
}

function segmentsEqual(
    left: QaapAgentMessageSegmentDTO,
    right: QaapAgentMessageSegmentDTO,
): boolean {
    return segmentFingerprint(left) === segmentFingerprint(right);
}

/** Smallest wire delta between two in-memory agent message snapshots. */
export function computeAgentMessageWireDelta(
    previous: QaapAgentMessageWireSnapshot | undefined,
    next: QaapAgentMessageWireSnapshot,
    agentId: string,
): QaapAgentMessageWireDelta {
    if (!previous) {
        return { kind: 'message_start', message: toWireMessage(next) };
    }
    if (previous.id !== next.id || previous.role !== next.role) {
        return { kind: 'replace', message: toWireMessage(next) };
    }

    const structured = usesStructuredAgentTranscript(agentId);
    if (!structured) {
        const prevContent = previous.content ?? '';
        const nextContent = next.content ?? '';
        if (nextContent === prevContent) {
            return { kind: 'noop' };
        }
        if (nextContent.startsWith(prevContent) && nextContent.length > prevContent.length) {
            return {
                kind: 'append_content',
                messageId: next.id,
                text: nextContent.slice(prevContent.length),
            };
        }
        return { kind: 'replace', message: toWireMessage(next) };
    }

    const prevSegments = previous.segments ?? [];
    const nextSegments = next.segments ?? [];
    if (prevSegments.length === 0 && nextSegments.length > 0) {
        return { kind: 'replace', message: toWireMessage(next) };
    }

    if (nextSegments.length === prevSegments.length + 1) {
        for (let index = 0; index < prevSegments.length; index++) {
            if (!segmentsEqual(prevSegments[index], nextSegments[index])) {
                return { kind: 'replace', message: toWireMessage(next) };
            }
        }
        return {
            kind: 'append_segment',
            messageId: next.id,
            segment: nextSegments[nextSegments.length - 1],
        };
    }

    if (prevSegments.length !== nextSegments.length) {
        return { kind: 'replace', message: toWireMessage(next) };
    }

    let textGrowth: { segmentIndex: number; text: string } | undefined;
    let toolPatch: Extract<QaapAgentMessageWireDelta, { kind: 'patch_tool' }> | undefined;

    for (let index = 0; index < prevSegments.length; index++) {
        const prev = prevSegments[index];
        const incoming = nextSegments[index];
        if (segmentsEqual(prev, incoming)) {
            continue;
        }
        if (prev.type === 'text' && incoming.type === 'text') {
            const previousText = prev.content ?? '';
            const incomingText = incoming.content ?? '';
            if (incomingText.startsWith(previousText) && incomingText.length > previousText.length) {
                const candidate = {
                    segmentIndex: index,
                    text: incomingText.slice(previousText.length),
                };
                if (textGrowth) {
                    return { kind: 'replace', message: toWireMessage(next) };
                }
                textGrowth = candidate;
                continue;
            }
            return { kind: 'replace', message: toWireMessage(next) };
        }
        if (prev.type === 'tool' && incoming.type === 'tool') {
            if (prev.toolUseId !== incoming.toolUseId || prev.name !== incoming.name) {
                return { kind: 'replace', message: toWireMessage(next) };
            }
            const previousArgs = prev.args ?? '';
            const incomingArgs = incoming.args ?? '';
            const previousResult = prev.result ?? '';
            const incomingResult = incoming.result ?? '';
            const argsAppend = incomingArgs.startsWith(previousArgs) && incomingArgs.length > previousArgs.length
                ? incomingArgs.slice(previousArgs.length)
                : undefined;
            const resultAppend = incomingResult.startsWith(previousResult) && incomingResult.length > previousResult.length
                ? incomingResult.slice(previousResult.length)
                : undefined;
            const finished = !prev.finished && incoming.finished ? true : undefined;
            if (!argsAppend && !resultAppend && finished === undefined) {
                return { kind: 'replace', message: toWireMessage(next) };
            }
            const candidate = {
                kind: 'patch_tool' as const,
                messageId: next.id,
                toolUseId: incoming.toolUseId,
                ...(argsAppend ? { argsAppend } : {}),
                ...(resultAppend ? { resultAppend } : {}),
                ...(finished ? { finished } : {}),
            };
            if (toolPatch) {
                return { kind: 'replace', message: toWireMessage(next) };
            }
            toolPatch = candidate;
            continue;
        }
        return { kind: 'replace', message: toWireMessage(next) };
    }

    if (textGrowth && toolPatch) {
        return { kind: 'replace', message: toWireMessage(next) };
    }
    if (textGrowth) {
        return {
            kind: 'append_segment_text',
            messageId: next.id,
            segmentIndex: textGrowth.segmentIndex,
            text: textGrowth.text,
        };
    }
    if (toolPatch) {
        return toolPatch;
    }

    const prevContent = previous.content ?? '';
    const nextContent = next.content ?? '';
    if (nextContent !== prevContent) {
        if (nextContent.startsWith(prevContent) && nextContent.length > prevContent.length) {
            return {
                kind: 'append_content',
                messageId: next.id,
                text: nextContent.slice(prevContent.length),
            };
        }
        return { kind: 'replace', message: toWireMessage(next) };
    }

    return { kind: 'noop' };
}

/** Apply one wire delta onto an in-memory conversation snapshot. */
export function applyAgentMessageWireDelta(
    conv: { readonly messages: readonly QaapAgentMessageDTO[] },
    delta: QaapAgentMessageWireDelta,
): QaapAgentMessageDTO | undefined {
    switch (delta.kind) {
        case 'noop':
            return undefined;
        case 'message_start':
        case 'replace':
            return delta.message;
        case 'append_content':
            return patchMessage(conv, delta.messageId, message => ({
                ...message,
                content: `${message.content ?? ''}${delta.text}`,
            }));
        case 'append_segment_text':
            return patchMessage(conv, delta.messageId, message => ({
                ...message,
                segments: (message.segments ?? []).map((segment, index) => (
                    index === delta.segmentIndex && segment.type === 'text'
                        ? { ...segment, content: `${segment.content ?? ''}${delta.text}` }
                        : segment
                )),
            }));
        case 'patch_tool':
            return patchMessage(conv, delta.messageId, message => ({
                ...message,
                segments: (message.segments ?? []).map(segment => {
                    if (segment.type !== 'tool' || segment.toolUseId !== delta.toolUseId) {
                        return segment;
                    }
                    return {
                        ...segment,
                        ...(delta.argsAppend !== undefined
                            ? { args: `${segment.args ?? ''}${delta.argsAppend}` }
                            : {}),
                        ...(delta.resultAppend !== undefined
                            ? { result: `${segment.result ?? ''}${delta.resultAppend}` }
                            : {}),
                        ...(delta.finished ? { finished: true } : {}),
                    };
                }),
            }));
        case 'append_segment':
            return patchMessage(conv, delta.messageId, message => ({
                ...message,
                segments: [...(message.segments ?? []), delta.segment],
            }));
        default: {
            const exhaustive: never = delta;
            return exhaustive;
        }
    }
}

function patchMessage(
    conv: { readonly messages: readonly QaapAgentMessageDTO[] },
    messageId: string,
    patch: (message: QaapAgentMessageDTO) => QaapAgentMessageDTO,
): QaapAgentMessageDTO | undefined {
    const existing = conv.messages.find(message => message.id === messageId);
    if (!existing) {
        return undefined;
    }
    return patch(existing);
}
