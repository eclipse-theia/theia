// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
import { ChatResponseContent, ThinkingChatResponseContent } from '@theia/ai-chat/lib/common';
import { ReactNode } from '@theia/core/shared/react';
import { nls } from '@theia/core/lib/common/nls';
import * as React from '@theia/core/shared/react';

@injectable()
export class ThinkingPartRenderer implements ChatResponsePartRenderer<ThinkingChatResponseContent> {

    canHandle(response: ChatResponseContent): number {
        if (ThinkingChatResponseContent.is(response)) {
            return 10;
        }
        return -1;
    }

    render(response: ThinkingChatResponseContent): ReactNode {
        return (
            <div className='theia-thinking'>
                <details>
                    <summary>{nls.localize('theia/ai/chat-ui/thinking-part-renderer/thinking', 'Thinking')}</summary>
                    <pre>{response.content}</pre>
                </details>
            </div>
        );
    }
}
