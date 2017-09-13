/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { IBaseTerminalServer, IBaseTerminalServerOptions } from './base-terminal-protocol';

export const IShellTerminalServer = Symbol('IShellTerminalServer');

export interface IShellTerminalServer extends IBaseTerminalServer {
}

export const shellTerminalPath = '/services/shell-terminal';

export interface IShellTerminalServerOptions extends IBaseTerminalServerOptions {
    shell?: string,
    rootURI?: string,
    cols?: number,
    rows?: number
}
