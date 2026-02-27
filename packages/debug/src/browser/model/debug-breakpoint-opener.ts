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

import { inject, injectable } from '@theia/core/shared/inversify';
import { MaybePromise, URI } from '@theia/core';
import { OpenHandler, OpenerOptions } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser';
import { BreakpointManager } from '../breakpoint/breakpoint-manager';
import { DebugSessionManager } from '../debug-session-manager';
import { DEBUG_BREAKPOINT_SCHEME } from '../breakpoint/breakpoint-marker';

@injectable()
export class DebugBreakpointOpener implements OpenHandler {
    @inject(BreakpointManager) protected readonly breakpointManager: BreakpointManager;
    @inject(DebugSessionManager) protected readonly sessionManager: DebugSessionManager;
    @inject(EditorManager) protected readonly editorManager: EditorManager;

    readonly id = 'debug-breakpoint-opener';

    canHandle(uri: URI, options?: OpenerOptions | undefined): MaybePromise<number> {
        return uri.scheme === DEBUG_BREAKPOINT_SCHEME ? 150 : -1;
    }

    open(uri: URI, options?: OpenerOptions | undefined): MaybePromise<object | undefined> {
        if (uri.scheme !== DEBUG_BREAKPOINT_SCHEME) { throw new Error(`Unexpected scheme. Expected '${DEBUG_BREAKPOINT_SCHEME}' but got '${uri.scheme}'.`); }
        const bpId = uri.authority;
        const bp = this.breakpointManager.getBreakpointById(bpId);
        if (!bp) { return; }
        if (bp.raw?.source) {
            const session = this.sessionManager.getSession(bp.raw.sessionId);
            const source = session?.getSource(bp.raw.source);
            if (source) {
                return source.open(options);
            }
        }
        return this.editorManager.open(bp.uri, options);
    }
}
