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
import { ChatResponseContent, QuestionResponseContent } from '@theia/ai-chat';
import { injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ReactNode } from '@theia/core/shared/react';
import { ChatResponsePartRenderer } from '../chat-response-part-renderer';
import { ResponseNode } from '../chat-tree-view';

@injectable()
export class QuestionPartRenderer
    implements ChatResponsePartRenderer<QuestionResponseContent> {

    canHandle(response: ChatResponseContent): number {
        if (QuestionResponseContent.is(response)) {
            return 10;
        }
        return -1;
    }

    render(question: QuestionResponseContent, node: ResponseNode): ReactNode {
        return (
            <div className="theia-QuestionPartRenderer-root">
                <div className="theia-QuestionPartRenderer-question">{question.question}</div>
                <div className="theia-QuestionPartRenderer-options">
                    {
                        question.options.map((option, index) => (
                            <button
                                className={`theia-button theia-QuestionPartRenderer-option ${question.selectedOption === option ? 'selected' : ''}`}
                                onClick={() => {
                                    question.selectedOption = option;
                                    question.handler(option);
                                }}
                                disabled={question.selectedOption !== undefined || !node.response.isWaitingForInput}
                                key={index}
                            >
                                {option.text}
                            </button>
                        ))
                    }
                </div>
            </div>
        );
    }

}
