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

import { nls } from '@theia/core/lib/common/nls';
import * as React from '@theia/core/shared/react';

const markDoneLabel = nls.localizeByDefault('Mark Done');

export interface WalkthroughMarkDoneProps {
    onMarkDone: () => void;
}

export function WalkthroughMarkDone({
    onMarkDone,
}: WalkthroughMarkDoneProps): React.ReactElement {
    return (
        <div className='gs-walkthrough-done-container'>
            <a
                role='button'
                tabIndex={0}
                className='gs-walkthrough-mark-done'
                onClick={event => {
                    event.currentTarget.blur();
                    onMarkDone();
                }}
                onKeyDown={event =>
                    (event.key === 'Enter' || event.key === ' ') && onMarkDone()
                }
            >
                <i className='codicon codicon-check-all' />
                {markDoneLabel}
            </a>
        </div>
    );
}
