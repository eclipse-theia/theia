// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { ChatResponseContent, ToolCallChatResponseContent } from '@theia/ai-chat/lib/common';
import { ReactNode } from '@theia/core/shared/react';
import * as React from '@theia/core/shared/react';

@injectable()
export class ToolCallPartRenderer implements ChatResponsePartRenderer<ToolCallChatResponseContent> {

    canHandle(response: ChatResponseContent): number {
        if (ToolCallChatResponseContent.is(response)) {
            return 10;
        }
        return -1;
    }

    renderCollapsibleArguments(args: string | undefined): ReactNode {
        return (
            args && (
                <details style={{ display: 'inline' }}>
                    <summary
                        style={{
                            display: 'inline',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                        }}>
                        &gt;
                    </summary>
                    <span>{JSON.stringify(args, undefined, 2)}</span>
                </details>
            )
        );
    }

    render(response: ToolCallChatResponseContent): ReactNode {
        return (
            <h4 className='theia-toolCall'>
                {response.finished ? (
                    <details>
                        <summary>Ran [{response.name}
                            {response.arguments && <>({this.renderCollapsibleArguments(response.arguments)})</>}
                            ]</summary>
                        <pre>{this.tryPrettyPrintJson(response)}</pre>
                        {this.renderCollapsibleArguments(response.arguments)}
                    </details>
                ) : (
                    <span>
                        <Spinner /> Running [{response.name}
                        {response.arguments && <>({this.renderCollapsibleArguments(response.arguments)})</>}
                        ]
                    </span>
                )}
            </h4>
        );
    }

    private tryPrettyPrintJson(response: ToolCallChatResponseContent): string | undefined {
        let responseContent = response.result;
        try {
            if (response.result) {
                responseContent = JSON.stringify(JSON.parse(response.result), undefined, 2);
            }
        } catch (e) {
            // fall through
        }
        return responseContent;
    }
}

const Spinner = () => (
    <i className="fa fa-spinner fa-spin"></i>
);
