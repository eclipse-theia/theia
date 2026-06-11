// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export interface TranscriptMarkdownWorkerParseRequest {
    readonly type: 'parse';
    readonly requestId: number;
    readonly generation: number;
    readonly content: string;
}

export interface TranscriptMarkdownWorkerStreamRequest {
    readonly type: 'parse_stream';
    readonly requestId: number;
    readonly generation: number;
    readonly content: string;
    readonly previousStableLength: number;
    readonly previousTotalLength: number;
}

export type TranscriptMarkdownWorkerRequest =
    | TranscriptMarkdownWorkerParseRequest
    | TranscriptMarkdownWorkerStreamRequest;

export interface TranscriptMarkdownWorkerParseResponse {
    readonly type: 'result';
    readonly requestId: number;
    readonly generation: number;
    readonly html: string;
    readonly cleanLength: number;
}

export interface TranscriptMarkdownWorkerStreamResponse {
    readonly type: 'stream_result';
    readonly requestId: number;
    readonly generation: number;
    readonly cleanLength: number;
    readonly stableLength: number;
    readonly totalLength: number;
    readonly frozenHtml?: string;
    readonly tailHtml?: string;
    readonly noop?: boolean;
}

export type TranscriptMarkdownWorkerResponse =
    | TranscriptMarkdownWorkerParseResponse
    | TranscriptMarkdownWorkerStreamResponse;

export function shouldApplyTranscriptMarkdownWorkerResult(
    currentGeneration: number | undefined,
    resultGeneration: number,
): boolean {
    return currentGeneration === resultGeneration;
}
