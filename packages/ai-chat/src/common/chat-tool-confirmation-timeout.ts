// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { nls } from '@theia/core';
import { ToolCallChatResponseContent } from './chat-model';

/**
 * Races a tool confirmation against an optional timeout.
 *
 * - If `timeoutSeconds > 0`: creates a timer that auto-denies the content after the
 *   given number of seconds, races it against `content.confirmed`, and always
 *   clears the timer on completion.
 * - If `timeoutSeconds <= 0`: simply awaits `content.confirmed` with no timeout.
 */
export async function raceConfirmationWithTimeout(
    content: ToolCallChatResponseContent,
    timeoutSeconds: number
): Promise<boolean> {
    if (timeoutSeconds > 0) {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        try {
            const timeoutPromise = new Promise<boolean>(resolve => {
                timeoutId = setTimeout(() => {
                    if (!content.finished) {
                        content.deny(nls.localize(
                            'theia/ai/chat/toolConfirmationTimeout/denialReason',
                            'Confirmation timed out after {0} seconds',
                            `${timeoutSeconds}`
                        ));
                    }
                    resolve(false);
                }, timeoutSeconds * 1000);
            });
            return await Promise.race([content.confirmed, timeoutPromise]);
        } finally {
            if (timeoutId !== undefined) {
                clearTimeout(timeoutId);
            }
        }
    }
    return content.confirmed;
}
