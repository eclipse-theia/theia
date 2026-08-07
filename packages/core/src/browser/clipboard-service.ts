// *****************************************************************************
// Copyright (C) 2019 RedHat and others.
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

import { Event } from '../common/event';
import { MaybePromise } from '../common/types';

export const ClipboardService = Symbol('ClipboardService');
/**
 * Access to the system clipboard. Reading may require a user permission prompt in browsers.
 */
export interface ClipboardService {
    /** Returns the clipboard text, or an empty string if it cannot be read. */
    readText(): MaybePromise<string>;
    /** Writes the given text to the clipboard. */
    writeText(value: string): MaybePromise<void>;
    /**
     * Emitted with the written text after {@link writeText} updated the clipboard.
     * Such writes dispatch no DOM `copy` event, so this is the only way to observe them.
     */
    readonly onDidWriteText?: Event<string>;
}
