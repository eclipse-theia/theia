// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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

import * as React from '@theia/core/shared/react';
import { injectable } from '@theia/core/shared/inversify';
import { ChangeSetActionRenderer } from './change-set-action-service';
import { ChangeSetElement } from '@theia/ai-chat';
import { nls } from '@theia/core';

@injectable()
export class ChangeSetAcceptAction implements ChangeSetActionRenderer {
    readonly id = 'change-set-accept-action';
    canRender(elements: ChangeSetElement[]): boolean {
        return elements.length > 0;
    }

    render(elements: ChangeSetElement[]): React.ReactNode {
        return <button
            className='theia-button'
            disabled={!hasPendingElementsToAccept(elements)}
            title={nls.localize('theia/ai/chat-ui/applyAllTitle', 'Apply all pending changes')}
            onClick={() => acceptAllPendingElements(elements)}
        >
            {nls.localize('theia/ai/chat-ui/applyAll', 'Apply All')}
        </button>;
    }
}

function acceptAllPendingElements(elements: ChangeSetElement[]): void {
    acceptablePendingElements(elements).forEach(e => e.apply!());
}

function hasPendingElementsToAccept(elements: ChangeSetElement[]): boolean | undefined {
    return acceptablePendingElements(elements).length > 0;
}

function acceptablePendingElements(elements: ChangeSetElement[]): ChangeSetElement[] {
    return elements.filter(e => e.apply && (e.state === undefined || e.state === 'pending'));
}
