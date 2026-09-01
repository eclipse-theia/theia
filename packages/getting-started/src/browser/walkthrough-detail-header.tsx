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

import { codicon } from '@theia/core/lib/browser/widgets/widget';
import { nls } from '@theia/core/lib/common/nls';
import * as React from '@theia/core/shared/react';
import { Walkthrough } from '../common/walkthrough-types';
import { WalkthroughLabel } from './walkthrough-label';

const backLabel = nls.localizeByDefault('Back');

export interface WalkthroughDetailHeaderProps {
    walkthrough: Walkthrough;
    onBack: () => void;
}

export function WalkthroughDetailHeader({
    walkthrough,
    onBack,
}: WalkthroughDetailHeaderProps): React.ReactElement {
    const back = (event: React.SyntheticEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        (event.currentTarget as HTMLElement).blur();
        onBack();
    };
    return (
        <div className='gs-walkthrough-detail-header'>
            <a
                role='button'
                tabIndex={0}
                className='gs-walkthrough-back-link'
                onClick={back}
                onKeyDown={event =>
                    (event.key === 'Enter' || event.key === ' ') && back(event)
                }
            >
                <i className={codicon('arrow-left')} />
                {backLabel}
            </a>
            <div className='gs-walkthrough-category'>
                <div className='gs-walkthrough-category-description-container'>
                    <h2 className='gs-walkthrough-category-title gs-walkthrough-detail-title'>
                        <WalkthroughLabel label={walkthrough.title} />
                    </h2>
                    <div className='gs-walkthrough-category-description'>
                        <p>{walkthrough.description}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
