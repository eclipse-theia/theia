// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentMessageSegment } from '../common/qaap-qaiq-stream';

export type CliTranscriptParseWorkerRequest = {
    readonly type: 'parse';
    readonly requestId: number;
    readonly cacheKey: string;
    readonly agentId: string | undefined;
    readonly log: string;
};

export type CliTranscriptParseWorkerResponse = {
    readonly type: 'result';
    readonly requestId: number;
    readonly cacheKey: string;
    readonly content: string;
    readonly segments: readonly QaapAgentMessageSegment[];
};

export function shouldApplyCliTranscriptParseWorkerResult(
    currentRequestId: number | undefined,
    responseRequestId: number,
): boolean {
    return currentRequestId === responseRequestId;
}
