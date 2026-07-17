// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ChatResponsePartRenderer } from '../chat-response-part-renderer';
import { injectable } from '@theia/core/shared/inversify';
import { ChatResponseContent, CompactionChatResponseContent } from '@theia/ai-chat/lib/common';
import { ReactNode } from '@theia/core/shared/react';
import { nls } from '@theia/core/lib/common/nls';
import * as React from '@theia/core/shared/react';

@injectable()
export class CompactionPartRenderer implements ChatResponsePartRenderer<CompactionChatResponseContent> {

    canHandle(response: ChatResponseContent): number {
        if (CompactionChatResponseContent.is(response)) {
            return 10;
        }
        return -1;
    }

    render(response: CompactionChatResponseContent): ReactNode {
        const label = nls.localize('theia/ai/chat-ui/compaction-part-renderer/compactionMarker', 'Conversation compacted');
        if (response.summary) {
            return (
                <div className='theia-ChatCompactionMarker'>
                    <details>
                        <summary>{label}</summary>
                        <div className='theia-ChatCompactionMarker-summary'>{response.summary}</div>
                    </details>
                </div>
            );
        }
        return (
            <div className='theia-ChatCompactionMarker'>
                <span className='theia-ChatCompactionMarker-label'>{label}</span>
            </div>
        );
    }
}
