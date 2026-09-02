// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import type { ThemeService } from '@theia/core/lib/browser/theming';
import type { ILogger } from '@theia/core/lib/common/logger';
import * as React from '@theia/core/shared/react';
import type { Walkthrough, WalkthroughStep } from '../common/walkthrough-types';
import { WalkthroughDetailHeader } from './walkthrough-detail-header';
import { useWalkthroughStepsScrollbar } from './use-walkthrough-steps-scrollbar';
import { WalkthroughMarkDone } from './walkthrough-mark-done';
import { WalkthroughMedia } from './walkthrough-media';
import { WalkthroughStepItem } from './walkthrough-step-item';

export interface WalkthroughDetailProps {
    walkthrough: Walkthrough;
    onStepSelect: (step: WalkthroughStep) => void;
    onBack: () => void;
    selectedStep?: WalkthroughStep;
    markdownRenderer: MarkdownRenderer;
    onLinkClick?: (url: string) => void;
    onToggleStepDone?: (step: WalkthroughStep) => void;
    onMarkAllStepsDone?: () => void;
    themeService: ThemeService;
    logger: ILogger;
}

export function WalkthroughDetail(props: WalkthroughDetailProps): React.ReactElement {
    // eslint-disable-next-line no-null/no-null
    const stepsRef = React.useRef<HTMLDivElement>(null);
    const updateStepsShadow = useWalkthroughStepsScrollbar(stepsRef);
    React.useEffect(() => {
        const steps = stepsRef.current;
        const step = steps?.querySelector<HTMLElement>('.gs-walkthrough-step.selected')
            ?? steps?.querySelector<HTMLElement>('.gs-walkthrough-step');
        step?.focus();
    }, [props.selectedStep?.id, props.walkthrough.id]);
    React.useEffect(() => {
        const steps = stepsRef.current;
        if (!steps || !props.selectedStep) {
            return;
        }
        const selected = steps.querySelector('.gs-walkthrough-step.selected') as HTMLElement | null;
        if (!selected) {
            return;
        }
        const selectedTop = selected.offsetTop - steps.offsetTop;
        const selectedBottom = selectedTop + selected.offsetHeight;
        const visibleBottom = steps.scrollTop + steps.clientHeight;
        if (selectedTop < steps.scrollTop || selectedBottom > visibleBottom) {
            // `scrollIntoView` would also scroll the workbench.
            steps.scrollTop = selectedTop;
        }
        updateStepsShadow();
    }, [props.selectedStep?.id, updateStepsShadow]);

    return (
        <div className='gs-walkthrough-detail'>
            <div className='gs-walkthrough-detail-body'>
                <div className='gs-walkthrough-detail-left'>
                    <WalkthroughDetailHeader walkthrough={props.walkthrough} onBack={props.onBack} />
                    <div className='gs-walkthrough-steps-container'>
                        <div ref={stepsRef} className='gs-walkthrough-steps' role='list'>
                            {props.walkthrough.steps.map(step => (
                                <WalkthroughStepItem
                                    key={step.id}
                                    step={step}
                                    isSelected={props.selectedStep?.id === step.id}
                                    onSelect={props.onStepSelect}
                                    onCompletionToggle={toggledStep => props.onToggleStepDone?.(toggledStep)}
                                    markdownRenderer={props.markdownRenderer}
                                    onLinkClick={props.onLinkClick}
                                />
                            ))}
                            <WalkthroughMarkDone onMarkDone={() => props.onMarkAllStepsDone?.()} />
                        </div>
                        <div aria-hidden='true' className='gs-walkthrough-scroll-shadow top' />
                    </div>
                </div>
                <div className='gs-walkthrough-step-media'>
                    {props.selectedStep?.media && (
                        <WalkthroughMedia
                            step={props.selectedStep}
                            markdownRenderer={props.markdownRenderer}
                            themeService={props.themeService}
                            logger={props.logger}
                            onLinkClick={props.onLinkClick}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
