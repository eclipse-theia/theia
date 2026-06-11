// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Off-main-thread QAIQ / OpenCode / Codex NDJSON parsing.
 * A future WASM module can replace the inner {@link parseAgentLogForTranscript} call
 * without changing the worker protocol.
 */

import { parseAgentLogForTranscript } from '../common/qaap-cli-transcript-stream';
import type { CliTranscriptParseWorkerRequest, CliTranscriptParseWorkerResponse } from './qaap-cli-transcript-parse-worker-protocol';

self.onmessage = (event: MessageEvent<CliTranscriptParseWorkerRequest>): void => {
    const message = event.data;
    if (message?.type !== 'parse') {
        return;
    }
    const parsed = parseAgentLogForTranscript(message.agentId, message.log);
    const response: CliTranscriptParseWorkerResponse = {
        type: 'result',
        requestId: message.requestId,
        cacheKey: message.cacheKey,
        content: parsed.content,
        segments: parsed.segments,
    };
    self.postMessage(response);
};
