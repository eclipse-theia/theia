// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { MutableChatRequestModel } from '@theia/ai-chat/lib/common/chat-model';
import { QaapQaiqStreamAccumulator } from '../common/qaap-qaiq-stream';
import { qaiqSegmentsToChatContents, syncAgentResponseContents } from './qaap-qaiq-chat-contents';

/**
 * Mirrors {@link QaapQaiqStreamAccumulator} segments into a Theia chat response (thinking,
 * tool calls, markdown) the same way Codex / Claude Code agents do in ChatView.
 */
export class QaapQaiqChatStreamSync {

    constructor(
        protected readonly request: MutableChatRequestModel,
    ) { }

    apply(accumulator: QaapQaiqStreamAccumulator): void {
        const contents = qaiqSegmentsToChatContents(accumulator.getSegments(), '');
        if (contents.length === 0) {
            return;
        }
        const response = this.request.response.response;
        if (response.content.length === 0) {
            response.addContents(contents);
            response.responseContentChanged();
            return;
        }
        if (syncAgentResponseContents(response, contents)) {
            response.responseContentChanged();
        }
    }
}
