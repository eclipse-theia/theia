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
import { TextDocumentIdentifier, Command, MessageType } from "@theia/languages/lib/common";

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
    data?: any;
    commands?: Command[];
}

export namespace ClassFileContentsRequest {
    export const type = new RequestType<TextDocumentIdentifier, string | undefined, void, void>('java/classFileContents');
}

export namespace ActionableNotification {
    export const type = new NotificationType<ActionableMessage, void>('language/actionableNotification');
}
