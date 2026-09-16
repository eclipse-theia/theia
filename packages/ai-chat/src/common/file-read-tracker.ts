// *****************************************************************************
// Copyright (C) 2026 Ehab Younes.
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

import { URI } from '@theia/core';

export const FileReadTracker = Symbol('FileReadTracker');

/** Tracks the content an agent has seen per chat session, so that changes by anyone else can be reported back to it. */
export interface FileReadTracker {
    /** Snapshots `uri` as the session's agent just saw it, or forgets it if it is gone. Pass `content` when at hand to save a read. */
    recordRead(sessionId: string, uri: URI, content?: string): Promise<void>;
    /** Whether `uri` differs from what the session's agent last saw. `false` if never read or gone: neither holds content a write could discard. */
    isStale(sessionId: string, uri: URI): Promise<boolean>;
    /** Files changed since the session's agent read them, reported again until it reads them anew so an ignored notice cannot get lost. */
    getChangedFiles(sessionId: string): Promise<string[]>;
}
