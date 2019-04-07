/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { RequestType, NotificationType } from 'vscode-jsonrpc';
import { TextDocumentIdentifier, Command, MessageType, ExecuteCommandParams } from '@theia/languages/lib/browser';

export interface StatusReport {
    message: string;
    type: string;
}

export namespace StatusNotification {
    export const type = new NotificationType<StatusReport, void>('language/status');
}

export interface ActionableMessage {
    severity: MessageType;
    message: string;
    // tslint:disable-next-line:no-any
    data?: any;
    commands?: Command[];
}

export namespace ClassFileContentsRequest {
    export const type = new RequestType<TextDocumentIdentifier, string | undefined, void, void>('java/classFileContents');
}

export namespace ActionableNotification {
    export const type = new NotificationType<ActionableMessage, void>('language/actionableNotification');
}

export enum CompileWorkspaceStatus {
    FAILED = 0,
    SUCCEED = 1,
    WITHERROR = 2,
    CANCELLED = 3,
}

export namespace CompileWorkspaceRequest {
    export const type = new RequestType<boolean, CompileWorkspaceStatus, void, void>('java/buildWorkspace');
}

export namespace ExecuteClientCommand {
    export const type = new RequestType<ExecuteCommandParams, undefined, void, void>('workspace/executeClientCommand');
}
