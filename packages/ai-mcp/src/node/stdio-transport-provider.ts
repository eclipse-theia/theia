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
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
    isLocalMCPServerDescription,
    MCPServerDescription,
} from '../common/mcp-server-manager';
import { MCPTransport, MCPTransportProvider } from '../common/mcp-transport-provider';
import { SdkTransportAdapter } from './mcp-transport-adapter';

/**
 * Default transport provider for {@link LocalMCPServerDescription}. Wraps
 * the SDK's `StdioClientTransport` and reproduces the environment-merging
 * behaviour that {@link MCPServer} used to inline.
 */
@injectable()
export class StdioTransportProvider implements MCPTransportProvider {

    readonly id = 'stdio';
    readonly priority = 0;

    matches(description: MCPServerDescription): boolean {
        return isLocalMCPServerDescription(description);
    }

    async create(description: MCPServerDescription, signal: AbortSignal): Promise<MCPTransport> {
        if (signal.aborted) {
            throw new DOMException('Stdio transport creation aborted', 'AbortError');
        }
        if (!isLocalMCPServerDescription(description)) {
            throw new Error(`StdioTransportProvider cannot create a transport for remote description "${description.name}"`);
        }
        const sanitizedEnv: Record<string, string> = Object.fromEntries(
            Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
        );
        const mergedEnv: Record<string, string> = {
            ...sanitizedEnv,
            ...(description.env || {}),
        };
        const sdk = new StdioClientTransport({
            command: description.command,
            args: description.args,
            env: mergedEnv,
        });
        return new SdkTransportAdapter(sdk, 'stdio');
    }
}
