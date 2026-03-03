// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { ToolCallChatResponseContentImpl } from '@theia/ai-chat/lib/common';
import { ToolCallResult } from '@theia/ai-core';

export class CodexToolCallChatResponseContent extends ToolCallChatResponseContentImpl {
    static readonly type = 'codex-tool-call';

    constructor(id?: string, name?: string, arg_string?: string, finished?: boolean, result?: ToolCallResult) {
        super(id, name, arg_string, finished, result);
    }

    static is(content: unknown): content is CodexToolCallChatResponseContent {
        return content instanceof CodexToolCallChatResponseContent;
    }

    update(args?: string, finished?: boolean, result?: ToolCallResult): void {
        if (args !== undefined) {
            this._arguments = args;
        }
        if (finished !== undefined) {
            this._finished = finished;
        }
        if (result !== undefined) {
            this._result = result;
        }
    }
}
