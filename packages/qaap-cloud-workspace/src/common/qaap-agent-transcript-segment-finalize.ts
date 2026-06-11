// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentMessageSegment } from './qaap-agent-conversation';

/** Mark in-flight tool segments finished so list previews and turn status settle. */
export function finalizeUnfinishedAgentToolSegments(
    segments: readonly QaapAgentMessageSegment[] | undefined,
    interruptionReason: string,
): QaapAgentMessageSegment[] | undefined {
    if (!segments?.length) {
        return segments ? [...segments] : segments;
    }
    let changed = false;
    const next = segments.map(segment => {
        if (segment.type !== 'tool' || segment.finished) {
            return segment;
        }
        changed = true;
        return {
            ...segment,
            finished: true,
            result: segment.result?.trim() ? segment.result : interruptionReason,
        };
    });
    return changed ? next : [...segments];
}
