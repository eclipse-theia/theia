// *****************************************************************************
// Copyright (C) 2024 EclipseSource and others.
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

import { injectable } from '@theia/core/shared/inversify';
import {
    CancellationToken,
    ProgressClient, ProgressMessage, ProgressUpdate
} from '@theia/core';

/**
 * A simple progress client for headless plugins that just writes debug messages to the console
 * because there is no one connected frontend to which it is appropriate to send the messages.
 */
@injectable()
export class HeadlessProgressClient implements ProgressClient {
    async showProgress(_progressId: string, message: ProgressMessage, cancellationToken: CancellationToken): Promise<string | undefined> {
        if (cancellationToken.isCancellationRequested) {
            return ProgressMessage.Cancel;
        }
        console.debug(message.text);
    }

    async reportProgress(_progressId: string, update: ProgressUpdate, message: ProgressMessage, cancellationToken: CancellationToken): Promise<void> {
        if (cancellationToken.isCancellationRequested) {
            return;
        }
        const progress = update.work && update.work.total ? `[${100 * Math.min(update.work.done, update.work.total) / update.work.total}%]` : '';
        const text = `${progress} ${update.message ?? 'completed ...'}`;
        console.debug(text);
    }
}
