// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export interface TranscriptMarkdownWorkerRequest {
    readonly type: 'parse';
    readonly requestId: number;
    readonly generation: number;
    readonly content: string;
}

export interface TranscriptMarkdownWorkerResponse {
    readonly type: 'result';
    readonly requestId: number;
    readonly generation: number;
    readonly html: string;
    readonly cleanLength: number;
}

export function shouldApplyTranscriptMarkdownWorkerResult(
    currentGeneration: number | undefined,
    resultGeneration: number,
): boolean {
    return currentGeneration === resultGeneration;
}
