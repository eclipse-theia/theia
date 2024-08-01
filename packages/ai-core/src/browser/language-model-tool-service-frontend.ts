// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { LanguageModelToolServiceFrontend } from '../common';

@injectable()
export class LanguageModelToolServiceFrontendImpl implements LanguageModelToolServiceFrontend {
    private callbackMap: Map<string, (toolId: string, arg_string: string) => unknown> = new Map();

    registerToolCallback(agentId: string, callback: (toolId: string, arg_string: string) => unknown): void {
        this.callbackMap.set(agentId, callback);
    }
    async callTool(agentId: string, toolId: string, arg_string: string): Promise<unknown> {
        const callback = this.callbackMap.get(agentId);
        if (callback) {
            return callback(toolId, arg_string);
        } else {
            return Promise.reject(new Error(`No callback registered for agentId ${agentId}`));
        }
    }
}
