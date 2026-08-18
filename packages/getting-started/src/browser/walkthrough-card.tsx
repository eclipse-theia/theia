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

import { nls } from '@theia/core/lib/common/nls';
import * as React from '@theia/core/shared/react';
import { Walkthrough } from '../common/walkthrough-types';
import { WalkthroughIcon } from './walkthrough-icon';

export interface WalkthroughCardProps {
    walkthrough: Walkthrough;
    onSelect: (walkthrough: Walkthrough) => void;
}

export function WalkthroughCard(props: WalkthroughCardProps): React.ReactElement {
    const { walkthrough, onSelect } = props;
    const completedSteps = walkthrough.steps.filter(s => s.isComplete).length;
    const totalSteps = walkthrough.steps.length;

    return (
        <div
            className='gs-walkthrough-card'
            role='button'
            tabIndex={0}
            onClick={() => onSelect(walkthrough)}
            onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter') {
                    onSelect(walkthrough);
                }
            }}
        >
            <div className='gs-walkthrough-card-header'>
                <WalkthroughIcon walkthrough={walkthrough} />
                <h3 className='gs-walkthrough-card-title'>{walkthrough.title}</h3>
            </div>
            <p className='gs-walkthrough-card-description'>{walkthrough.description}</p>
            <div className='gs-walkthrough-card-progress'>
                <div className='gs-walkthrough-progress-bar'>
                    <div
                        className='gs-walkthrough-progress-fill'
                        style={{ width: totalSteps > 0 ? `${(completedSteps / totalSteps) * 100}%` : '0%' }}
                    ></div>
                </div>
                <span className='gs-walkthrough-progress-text'>
                    {nls.localizeByDefault('{0} of {1}', String(completedSteps), String(totalSteps))}
                </span>
            </div>
        </div>
    );
}
