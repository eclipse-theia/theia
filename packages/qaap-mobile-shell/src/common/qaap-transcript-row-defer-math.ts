// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export interface TranscriptRowDeferContext {
    readonly messageIndex: number;
    readonly messageCount: number;
    readonly conversationStreaming: boolean;
}

/** Historical rows defer heavy paint; the streaming tail always renders fully. */
export function shouldDeferTranscriptRowHeavyContent(ctx: TranscriptRowDeferContext): boolean {
    const isTail = ctx.messageIndex === ctx.messageCount - 1;
    return !(isTail && ctx.conversationStreaming);
}
