// *****************************************************************************
// Copyright (C) 2021 logi.cals GmbH, EclipseSource and others.
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

import { ElementHandle } from '@playwright/test';
import { TheiaStatusIndicator } from './theia-status-indicator';

export class TheiaProblemIndicator extends TheiaStatusIndicator {
    id = 'problem-marker-status';

    async numberOfProblems(): Promise<number> {
        const spans = await this.getSpans();
        return spans ? +await spans[1].innerText() : -1;
    }

    async numberOfWarnings(): Promise<number> {
        const spans = await this.getSpans();
        return spans ? +await spans[3].innerText() : -1;
    }

    protected async getSpans(): Promise<ElementHandle[] | undefined> {
        const handle = await this.getElementHandle();
        return handle?.$$('span');
    }
}
