// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentMessageDTO, QaapAgentMessageSegmentDTO } from './qaap-agent-conversation-client';
import type { QaapAgentMessageWireDelta } from './qaap-agent-message-wire-delta';
import type { QaapAgentWireCompressionEncoding } from './qaap-agent-wire-encoding';

export type { QaapAgentWireCompressionEncoding } from './qaap-agent-wire-encoding';
export { QAAP_AGENT_WIRE_COMPRESS_THRESHOLD } from './qaap-agent-wire-encoding';

export async function expandAgentMessageWireDelta(
    delta: QaapAgentMessageWireDelta,
): Promise<QaapAgentMessageWireDelta> {
    switch (delta.kind) {
        case 'append_content': {
            const text = await maybeDecompressWireText(delta.text, delta.textEncoding);
            if (text === delta.text && delta.textEncoding === undefined) {
                return delta;
            }
            const { textEncoding: _omit, ...rest } = delta;
            return { ...rest, text: text ?? '' };
        }
        case 'append_segment_text': {
            const text = await maybeDecompressWireText(delta.text, delta.textEncoding);
            if (text === delta.text && delta.textEncoding === undefined) {
                return delta;
            }
            const { textEncoding: _omit, ...rest } = delta;
            return { ...rest, text: text ?? '' };
        }
        case 'patch_tool': {
            const argsAppend = await maybeDecompressWireText(delta.argsAppend, delta.argsAppendEncoding);
            const resultAppend = await maybeDecompressWireText(delta.resultAppend, delta.resultAppendEncoding);
            if (argsAppend === delta.argsAppend
                && resultAppend === delta.resultAppend
                && delta.argsAppendEncoding === undefined
                && delta.resultAppendEncoding === undefined) {
                return delta;
            }
            const {
                argsAppendEncoding: _argsEnc,
                resultAppendEncoding: _resultEnc,
                ...rest
            } = delta;
            return {
                ...rest,
                ...(argsAppend !== undefined ? { argsAppend } : {}),
                ...(resultAppend !== undefined ? { resultAppend } : {}),
            };
        }
        case 'append_segment': {
            const segment = await expandAgentMessageSegment(delta.segment);
            if (segment === delta.segment) {
                return delta;
            }
            return { ...delta, segment };
        }
        case 'message_start':
        case 'replace': {
            const message = await expandAgentMessageForWire(delta.message);
            if (message === delta.message) {
                return delta;
            }
            return { ...delta, message };
        }
        default:
            return delta;
    }
}

export async function expandAgentMessageForWire(message: QaapAgentMessageDTO): Promise<QaapAgentMessageDTO> {
    if (!message.segments?.length) {
        return message;
    }
    let changed = false;
    const segments: QaapAgentMessageSegmentDTO[] = [];
    for (const segment of message.segments) {
        const expanded = await expandAgentMessageSegment(segment);
        if (expanded !== segment) {
            changed = true;
        }
        segments.push(expanded);
    }
    return changed ? { ...message, segments } : message;
}

async function expandAgentMessageSegment(segment: QaapAgentMessageSegmentDTO): Promise<QaapAgentMessageSegmentDTO> {
    if (segment.type !== 'tool') {
        return segment;
    }
    const args = await maybeDecompressWireText(segment.args, segment.argsEncoding);
    const result = await maybeDecompressWireText(segment.result, segment.resultEncoding);
    if (args === segment.args && result === segment.result) {
        return segment;
    }
    const { argsEncoding: _argsEnc, resultEncoding: _resultEnc, ...rest } = segment;
    return {
        ...rest,
        args: args ?? '',
        ...(result !== undefined ? { result } : {}),
    };
}

async function maybeDecompressWireText(
    value: string | undefined,
    encoding: QaapAgentWireCompressionEncoding | undefined,
): Promise<string | undefined> {
    if (value === undefined || encoding === undefined) {
        return value;
    }
    if (encoding !== 'deflate-base64') {
        return value;
    }
    return decompressDeflateBase64(value);
}

async function decompressDeflateBase64(encoded: string): Promise<string> {
    const bytes = base64ToUint8Array(encoded);
    if (typeof DecompressionStream !== 'undefined') {
        const stream = new DecompressionStream('deflate-raw');
        const writer = stream.writable.getWriter();
        await writer.write(bytes);
        await writer.close();
        const output = await new Response(stream.readable).arrayBuffer();
        return new TextDecoder().decode(output);
    }
    throw new Error('deflate-base64 wire payloads require DecompressionStream support.');
}

function base64ToUint8Array(encoded: string): Uint8Array {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

declare const DecompressionStream: {
    new (format: 'deflate-raw'): TransformStream<Uint8Array, Uint8Array>;
};
