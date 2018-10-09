/********************************************************************************
 * Copyright (C) TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { Marker } from '@theia/markers/lib/common/marker';
import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';

export const BREAKPOINT_KIND = 'breakpoint';

export interface SourceBreakpoint {
    uri: string;
    enabled: boolean;
    raw: DebugProtocol.SourceBreakpoint
}

export interface BreakpointMarker extends Marker<SourceBreakpoint> {
    kind: 'breakpoint'
}

export namespace BreakpointMarker {
    export function is(node: Marker<object>): node is BreakpointMarker {
        return 'kind' in node && node.kind === BREAKPOINT_KIND;
    }
}
