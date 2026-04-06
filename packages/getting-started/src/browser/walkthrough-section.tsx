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
import { nls } from '@theia/core/lib/common/nls';
import * as React from '@theia/core/shared/react';
import { Walkthrough, WalkthroughStep } from '../common/walkthrough-types';
import { WalkthroughService } from './walkthrough-service';
import { WalkthroughCard, WalkthroughDetail } from './walkthrough-widget';

export interface WalkthroughSectionProps {
    walkthroughService: WalkthroughService;
    markdownRenderer: MarkdownRenderer;
}

export function WalkthroughSection(props: WalkthroughSectionProps): React.ReactElement {
    const { walkthroughService } = props;
    const [walkthroughs, setWalkthroughs] = React.useState<Walkthrough[]>(walkthroughService.getWalkthroughs());
    const [selectedWalkthrough, setSelectedWalkthrough] = React.useState<Walkthrough | undefined>(undefined);
    const [selectedStep, setSelectedStep] = React.useState<WalkthroughStep | undefined>(undefined);

    React.useEffect(() => {
        const disposable = walkthroughService.onDidChangeWalkthroughs(() => {
            setWalkthroughs(walkthroughService.getWalkthroughs());
            if (selectedWalkthrough) {
                const updated = walkthroughService.getWalkthrough(selectedWalkthrough.id);
                setSelectedWalkthrough(updated);
                if (selectedStep && updated) {
                    const updatedStep = updated.steps.find(s => s.id === selectedStep.id);
                    setSelectedStep(updatedStep);
                }
            }
        });
        return () => disposable.dispose();
    }, [walkthroughService, selectedWalkthrough, selectedStep]);

    React.useEffect(() => {
        const disposable = walkthroughService.onDidSelectWalkthrough(walkthroughId => {
            const walkthrough = walkthroughService.getWalkthrough(walkthroughId);
            if (walkthrough) {
                setSelectedWalkthrough(walkthrough);
                setSelectedStep(undefined);
            }
        });
        return () => disposable.dispose();
    }, [walkthroughService]);

    if (walkthroughs.length === 0) {
        return <React.Fragment />;
    }

    if (selectedWalkthrough) {
        return (
            <WalkthroughDetail
                walkthrough={selectedWalkthrough}
                onStepSelect={step => setSelectedStep(step)}
                onBack={() => {
                    setSelectedWalkthrough(undefined);
                    setSelectedStep(undefined);
                }}
                selectedStep={selectedStep}
                markdownRenderer={props.markdownRenderer}
                onLinkClick={url => props.walkthroughService.handleLinkClick(url)}
            />
        );
    }

    return (
        <div className='gs-section'>
            <h3 className='gs-section-header'>
                <i className={codicon('compass')}></i>
                {nls.localizeByDefault('Walkthroughs')}
            </h3>
            <div className='gs-walkthrough-cards'>
                {walkthroughs.map(walkthrough => (
                    <WalkthroughCard
                        key={walkthrough.id}
                        walkthrough={walkthrough}
                        onSelect={setSelectedWalkthrough}
                    />
                ))}
            </div>
        </div>
    );
}
