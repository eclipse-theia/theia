/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { RequestType, NotificationType } from 'vscode-jsonrpc';
import { TextDocumentIdentifier, Command, MessageType } from "@theia/languages/lib/common";

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
