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

import { codicon } from '@theia/core/lib/browser';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { ILogger } from '@theia/core/lib/common/logger';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { nls } from '@theia/core/lib/common/nls';
import * as React from '@theia/core/shared/react';
import { Walkthrough } from '../common/walkthrough-types';
import { WalkthroughService } from './walkthrough-service';
import { WalkthroughCard } from './walkthrough-card';
import { WalkthroughDetail } from './walkthrough-detail';

export interface WalkthroughSectionProps {
    walkthroughService: WalkthroughService;
    markdownRenderer: MarkdownRenderer;
    themeService: ThemeService;
    logger: ILogger;
    /** Offers all walkthroughs for selection, completed ones included. */
    onShowAll?: () => void;
}

/** How many walkthroughs are listed on the welcome page. */
export const WALKTHROUGH_LIST_LIMIT = 2;

/**
 * Renders the list of contributed walkthroughs, or the currently selected walkthrough.
 *
 * The selection is owned by the {@link WalkthroughService} rather than by this component, so that the
 * welcome view can give the selected walkthrough the whole view instead of a single section.
 */
export function WalkthroughSection(props: WalkthroughSectionProps): React.ReactElement {
    const { walkthroughService } = props;
    const [, forceUpdate] = React.useReducer((version: number) => version + 1, 0);

    React.useEffect(() => {
        const toDispose = new DisposableCollection(
            walkthroughService.onDidChangeWalkthroughs(() => forceUpdate()),
            walkthroughService.onDidChangeSelection(() => forceUpdate())
        );
        return () => toDispose.dispose();
    }, [walkthroughService]);

    const selectedWalkthrough = walkthroughService.selectedWalkthrough;
    if (selectedWalkthrough) {
        return (
            <WalkthroughDetail
                walkthrough={selectedWalkthrough}
                onStepSelect={step => walkthroughService.selectStep(step.id)}
                onBack={() => walkthroughService.clearSelection()}
                selectedStep={walkthroughService.selectedStep}
                markdownRenderer={props.markdownRenderer}
                onLinkClick={url => walkthroughService.handleLinkClick(url)}
                onToggleStepDone={step => step.isComplete
                    ? walkthroughService.markStepIncomplete(selectedWalkthrough.id, step.id)
                    : walkthroughService.markStepComplete(selectedWalkthrough.id, step.id)}
                onMarkAllStepsDone={() => walkthroughService.markAllStepsComplete(selectedWalkthrough.id)}
                themeService={props.themeService}
                logger={props.logger}
            />
        );
    }

    const walkthroughs = walkthroughService.getWalkthroughs();
    if (walkthroughs.length === 0) {
        return <React.Fragment />;
    }

    // A finished walkthrough has nothing left to offer here; it stays reachable through `onShowAll`.
    const pending = walkthroughs.filter(walkthrough => walkthrough.steps.some(step => !step.isComplete));
    const listed = pending.slice(0, WALKTHROUGH_LIST_LIMIT);
    return (
        <div className='gs-section'>
            <h3 className='gs-section-header'>
                <i className={codicon('compass')}></i>
                {nls.localizeByDefault('Walkthroughs')}
            </h3>
            <div className='gs-walkthrough-cards'>
                {listed.map(walkthrough => (
                    <WalkthroughCard
                        key={walkthrough.id}
                        walkthrough={walkthrough}
                        onSelect={(selected: Walkthrough) => walkthroughService.selectWalkthrough(selected.id)}
                    />
                ))}
            </div>
            {props.onShowAll && walkthroughs.length > listed.length && (
                <a
                    role='button'
                    tabIndex={0}
                    className='gs-walkthrough-more'
                    onClick={props.onShowAll}
                    onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === 'Enter') {
                            props.onShowAll?.();
                        }
                    }}
                >
                    {nls.localizeByDefault('More...')}
                </a>
            )}
        </div>
    );
}
