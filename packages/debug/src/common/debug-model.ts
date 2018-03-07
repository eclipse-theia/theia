/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { DebugProtocol } from "vscode-debugprotocol";

export namespace Debug {
    export class InitializeRequest implements DebugProtocol.InitializeRequest {
        arguments: DebugProtocol.InitializeRequestArguments;
        command: string;
        seq: number;
        type: string;
    }

    export class InitializeRequestArguments implements DebugProtocol.InitializeRequestArguments {
        clientID?: string | undefined;
        adapterID: string;
        locale?: string | undefined;
        linesStartAt1?: boolean | undefined;
        columnsStartAt1?: boolean | undefined;
        pathFormat?: string | undefined;
        supportsVariableType?: boolean | undefined;
        supportsVariablePaging?: boolean | undefined;
        supportsRunInTerminalRequest?: boolean | undefined;
    }

    export class InitializeResponse implements DebugProtocol.InitializeResponse {
        body?: DebugProtocol.Capabilities | undefined;
        request_seq: number;
        success: boolean;
        command: string;
        message?: string | undefined;
        seq: number;
        type: string;
    }
}
