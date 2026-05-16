// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from 'react';
import { injectable } from '@theia/core/shared/inversify';
import { StatusBarImpl } from '@theia/core/lib/browser/status-bar/status-bar';

/**
 * Mobile-friendly status bar track (horizontal scroll, center spacer).
 * Replaces product markup formerly in `@theia/core` `StatusBarImpl`.
 */
@injectable()
export class QaapStatusBarImpl extends StatusBarImpl {

    protected override render(): React.JSX.Element {
        const leftEntries = Array.from(this.viewModel.getLeft(), entry => this.renderElement(entry));
        const rightEntries = Array.from(this.viewModel.getRight(), entry => this.renderElement(entry));

        return (
            <div className='theia-statusBar-track'>
                <div className='area left'>{leftEntries}</div>
                <div className='theia-statusBar-center-spacer' aria-hidden={true} />
                <div className='area right'>{rightEntries}</div>
            </div>
        );
    }
}
