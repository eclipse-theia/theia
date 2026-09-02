// *****************************************************************************
// Copyright (C) 2026 Renesas Electronics Corporation and others.
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

import type { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { codicon } from '@theia/core/lib/browser/widgets/widget';
import { nls } from '@theia/core/lib/common/nls';
import * as React from '@theia/core/shared/react';
import { WalkthroughStep } from '../common/walkthrough-types';
import { WalkthroughLabel } from './walkthrough-label';
import { WalkthroughStepDescription } from './walkthrough-step-description';

const markIncompleteLabel = nls.localize('theia/getting-started/markStepIncomplete', 'Mark step incomplete');
const markCompleteLabel = nls.localize('theia/getting-started/markStepComplete', 'Mark step complete');

function preventPointerFocus(event: React.MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
}

export interface WalkthroughStepItemProps {
    step: WalkthroughStep;
    isSelected: boolean;
    onSelect: (step: WalkthroughStep) => void;
    onCompletionToggle: (step: WalkthroughStep) => void;
    markdownRenderer: MarkdownRenderer;
    onLinkClick?: (url: string) => void;
}

/**
 * https://github.com/microsoft/vscode/blob/1.134.0/src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.ts#L1500-L1525
 */
export function WalkthroughStepItem(
    props: WalkthroughStepItemProps,
): React.ReactElement {
    const { step } = props;
    return (
        <div
            className={`gs-walkthrough-step ${props.isSelected ? 'selected' : ''} ${step.isComplete ? 'completed' : ''}`}
            role='listitem'
            aria-current={props.isSelected ? 'step' : undefined}
            tabIndex={-1}
        >
            <div
                className='gs-walkthrough-step-item'
                onClick={() => props.onSelect(step)}
            >
                <button
                    className={`gs-walkthrough-step-icon ${codicon(step.isComplete ? 'pass-filled' : 'circle-large-outline')}`}
                    type='button'
                    role='checkbox'
                    aria-checked={step.isComplete}
                    onMouseDown={preventPointerFocus}
                    title={step.isComplete ? markIncompleteLabel : markCompleteLabel}
                    aria-label={step.isComplete
                        ? nls.localize('theia/getting-started/markStepIncompleteAria', 'Mark {0} incomplete', step.title)
                        : nls.localize('theia/getting-started/markStepCompleteAria', 'Mark {0} complete', step.title)}
                    onClick={event => {
                        event.stopPropagation();
                        props.onCompletionToggle(step);
                    }}
                    onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            props.onCompletionToggle(step);
                        }
                    }}
                />
                <button
                    className='gs-walkthrough-step-select'
                    type='button'
                    onMouseDown={preventPointerFocus}
                    aria-expanded={props.isSelected}
                    onClick={event => {
                        event.stopPropagation();
                        props.onSelect(step);
                    }}
                    onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            props.onSelect(step);
                        }
                    }}
                >
                    <h3 className='gs-walkthrough-step-title'>
                        <WalkthroughLabel label={step.title} />
                    </h3>
                </button>
            </div>
            {props.isSelected && (
                <div className='gs-walkthrough-step-content'>
                    <WalkthroughStepDescription
                        description={step.description}
                        markdownRenderer={props.markdownRenderer}
                        onLinkClick={props.onLinkClick}
                    />
                </div>
            )}
        </div>
    );
}
