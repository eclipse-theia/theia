
/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { MessageConnection } from "vscode-jsonrpc";

export const THEIA_PARENT_PID = 'THEIA_PARENT_PID';
export const THEIA_ENTRY_POINT = 'THEIA_ENTRY_POINT';

export type IPCEntryPoint = (connection: MessageConnection) => void;
