// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { deflateRawSync, inflateRawSync } from 'zlib';
import type { QaapAgentMessageDTO, QaapAgentMessageSegmentDTO } from '@theia/qaap-mobile-shell/lib/common/qaap-agent-conversation-client';
import type { QaapAgentMessageWireDelta } from '@theia/qaap-mobile-shell/lib/common/qaap-agent-message-wire-delta';
import type { QaapAgentWireCompressionEncoding } from '@theia/qaap-mobile-shell/lib/common/qaap-agent-wire-encoding';
import { QAAP_AGENT_WIRE_COMPRESS_THRESHOLD } from '@theia/qaap-mobile-shell/lib/common/qaap-agent-wire-encoding';

interface CompressedWireText {
    readonly value: string;
    readonly encoding?: QaapAgentWireCompressionEncoding;
}

/** Compress large tool/stdout chunks before they hit SSE or WebSocket JSON frames. */
export function compressAgentMessageWireDeltaForWire(delta: QaapAgentMessageWireDelta): QaapAgentMessageWireDelta {
    switch (delta.kind) {
        case 'append_content': {
            const compressed = maybeCompressWireText(delta.text);
            if (!compressed.encoding) {
                return delta;
            }
            return { ...delta, text: compressed.value, textEncoding: compressed.encoding };
        }
        case 'append_segment_text': {
            const compressed = maybeCompressWireText(delta.text);
            if (!compressed.encoding) {
                return delta;
            }
            return { ...delta, text: compressed.value, textEncoding: compressed.encoding };
        }
        case 'patch_tool': {
            let changed = false;
            const next = { ...delta };
            if (delta.argsAppend !== undefined) {
                const argsAppend = maybeCompressWireText(delta.argsAppend);
                next.argsAppend = argsAppend.value;
                if (argsAppend.encoding) {
                    next.argsAppendEncoding = argsAppend.encoding;
                    changed = true;
                }
            }
            if (delta.resultAppend !== undefined) {
                const resultAppend = maybeCompressWireText(delta.resultAppend);
                next.resultAppend = resultAppend.value;
                if (resultAppend.encoding) {
                    next.resultAppendEncoding = resultAppend.encoding;
                    changed = true;
                }
            }
            return changed ? next : delta;
        }
        case 'append_segment': {
            const segment = compressAgentMessageSegmentForWire(delta.segment);
            if (segment === delta.segment) {
                return delta;
            }
            return { ...delta, segment };
        }
        case 'message_start':
        case 'replace':
            return { ...delta, message: compressAgentMessageForWire(delta.message) };
        default:
            return delta;
    }
}

export function compressAgentMessageForWire(message: QaapAgentMessageDTO): QaapAgentMessageDTO {
    if (!message.segments?.length) {
        return message;
    }
    let changed = false;
    const segments = message.segments.map(segment => {
        const compressed = compressAgentMessageSegmentForWire(segment);
        if (compressed !== segment) {
            changed = true;
        }
        return compressed;
    });
    return changed ? { ...message, segments } : message;
}

function compressAgentMessageSegmentForWire(segment: QaapAgentMessageSegmentDTO): QaapAgentMessageSegmentDTO {
    if (segment.type !== 'tool') {
        return segment;
    }
    const args = maybeCompressWireText(segment.args);
    const result = maybeCompressWireText(segment.result);
    if (!args.encoding && !result.encoding) {
        return segment;
    }
    return {
        ...segment,
        args: args.value,
        ...(args.encoding ? { argsEncoding: args.encoding } : {}),
        ...(result.value !== undefined ? { result: result.value } : {}),
        ...(result.encoding ? { resultEncoding: result.encoding } : {}),
    };
}

function maybeCompressWireText(text: string | undefined): CompressedWireText {
    if (text === undefined || text.length < QAAP_AGENT_WIRE_COMPRESS_THRESHOLD) {
        return { value: text ?? '' };
    }
    const compressed = deflateRawSync(Buffer.from(text, 'utf8'));
    const encoded = compressed.toString('base64');
    if (encoded.length >= text.length) {
        return { value: text };
    }
    return { value: encoded, encoding: 'deflate-base64' };
}

/** Test helper — round-trip compressed payloads without a browser DecompressionStream. */
export function inflateDeflateBase64ForTests(encoded: string): string {
    return inflateRawSync(Buffer.from(encoded, 'base64')).toString('utf8');
}
