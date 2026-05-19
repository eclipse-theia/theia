// *****************************************************************************
// Copyright (C) 2026 Satish Shivaji Rao.
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
    MCPToolFilter,
    MCPToolFilterOutcome,
} from '../common/mcp-tool-filter';

/**
 * The lowest-priority {@link MCPToolFilter} contribution: always returns
 * `'passthrough'`, meaning "no change; defer to the next filter (if any)
 * or accept the tool as-is". Ensures the filter chain is non-empty by
 * default so {@link MCPServer} can rely on it without null-checks.
 */
@injectable()
export class PassthroughToolFilter implements MCPToolFilter {

    readonly id = 'passthrough';
    readonly priority = 0;

    filter(): MCPToolFilterOutcome {
        return 'passthrough';
    }
}
