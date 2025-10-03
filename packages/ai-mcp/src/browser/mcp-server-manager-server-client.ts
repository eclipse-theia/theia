// *****************************************************************************
// Copyright (C) 2025 Dirk Fauth and others.
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
import { MCPServerDescription, MCPServerManagerServerClient } from '../common';

@injectable()
export class MCPServerManagerServerClientImpl implements MCPServerManagerServerClient {

    protected serverDescriptions: Map<string, MCPServerDescription> = new Map();

    addServerDescription(description: MCPServerDescription): MCPServerDescription {
        if (description.resolve) {
            const serverDescription: MCPServerDescription = {
                ...description,
                resolveId: crypto.randomUUID(),
            };

            // store the original description to be used in resolveServerDescription
            if (serverDescription.resolveId) {
                this.serverDescriptions.set(serverDescription.resolveId, description);
            }

            return serverDescription;
        }
        return description;
    }

    async resolveServerDescription(description: MCPServerDescription): Promise<MCPServerDescription> {
        if (description.resolveId) {
            const frontendDescription = this.serverDescriptions.get(description.resolveId);
            if (frontendDescription && frontendDescription.resolve) {
                const updated = await frontendDescription.resolve(description);
                if (updated) {
                    this.serverDescriptions.set(description.resolveId, updated);
                    return updated;
                }
            }
        }
        return description;
    }
}
