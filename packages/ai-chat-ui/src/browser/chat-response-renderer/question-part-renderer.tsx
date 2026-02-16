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
import { nls } from '@theia/core';
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
        if (question.multiSelect) {
            return <MultiSelectQuestion question={question} node={node} />;
        }
        return <SingleSelectQuestion question={question} node={node} />;
    }

}

function SingleSelectQuestion({ question, node }: { question: QuestionResponseContent, node: ResponseNode }): React.JSX.Element {
    const isDisabled = question.isReadOnly || question.selectedOption !== undefined || !node.response.isWaitingForInput;
    const hasDescriptions = question.options.some(option => option.description);

    return (
        <div className="theia-QuestionPartRenderer-root">
            {question.header && <div className="theia-QuestionPartRenderer-header">{question.header}</div>}
            <div className="theia-QuestionPartRenderer-question">{question.question}</div>
            <div className={`theia-QuestionPartRenderer-options ${hasDescriptions ? 'has-descriptions' : ''}`}>
                {
                    question.options.map((option, index) => (
                        <button
                            className={`theia-QuestionPartRenderer-option ${question.selectedOption?.text === option.text ? 'selected' : ''}`}
                            onClick={() => {
                                if (!question.isReadOnly && question.handler) {
                                    question.selectedOption = option;
                                    question.handler(option);
                                }
                            }}
                            disabled={isDisabled}
                            key={index}
                            title={option.description}
                        >
                            <span className="theia-QuestionPartRenderer-option-label">{option.text}</span>
                            {option.description && (
                                <span className="theia-QuestionPartRenderer-option-description">{option.description}</span>
                            )}
                        </button>
                    ))
                }
            </div>
        </div>
    );
}

function MultiSelectQuestion({ question, node }: { question: QuestionResponseContent, node: ResponseNode }): React.JSX.Element {
    const restoredIndices = React.useMemo(() => {
        if (question.selectedOptions && question.selectedOptions.length > 0) {
            const indices = new Set<number>();
            for (const selected of question.selectedOptions) {
                const idx = question.options.findIndex(o => o.text === selected.text);
                if (idx >= 0) {
                    indices.add(idx);
                }
            }
            return indices;
        }
        return new Set<number>();
    }, []);

    const [selectedIndices, setSelectedIndices] = React.useState<Set<number>>(restoredIndices);
    const [confirmed, setConfirmed] = React.useState(restoredIndices.size > 0);
    const isDisabled = question.isReadOnly || confirmed || !node.response.isWaitingForInput;
    const hasDescriptions = question.options.some(option => option.description);

    const toggleOption = (index: number): void => {
        if (isDisabled) {
            return;
        }
        setSelectedIndices(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    const handleConfirm = (): void => {
        if (isDisabled || selectedIndices.size === 0) {
            return;
        }
        const selectedOpts = Array.from(selectedIndices)
            .sort((a, b) => a - b)
            .map(i => question.options[i]);
        question.selectedOptions = selectedOpts;
        setConfirmed(true);
        if (question.multiSelectHandler) {
            question.multiSelectHandler(selectedOpts);
        }
    };

    return (
        <div className="theia-QuestionPartRenderer-root">
            {question.header && <div className="theia-QuestionPartRenderer-header">{question.header}</div>}
            <div className="theia-QuestionPartRenderer-question">{question.question}</div>
            <div className={`theia-QuestionPartRenderer-options ${hasDescriptions ? 'has-descriptions' : ''}`}>
                {question.options.map((option, index) => (
                    <button
                        className={`theia-QuestionPartRenderer-option ${selectedIndices.has(index) ? 'selected' : ''}`}
                        onClick={() => toggleOption(index)}
                        disabled={isDisabled}
                        key={index}
                        title={option.description}
                    >
                        <span className="theia-QuestionPartRenderer-option-label">{option.text}</span>
                        {option.description && (
                            <span className="theia-QuestionPartRenderer-option-description">{option.description}</span>
                        )}
                    </button>
                ))}
            </div>
            {!isDisabled && (
                <button
                    className="theia-QuestionPartRenderer-confirm theia-button main"
                    onClick={handleConfirm}
                    disabled={selectedIndices.size === 0}
                >
                    {nls.localizeByDefault('Confirm')}
                </button>
            )}
        </div>
    );
}
