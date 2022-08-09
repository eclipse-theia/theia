// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import assert = require('assert');
import { connect } from 'net';
import 'reflect-metadata';
import { dynamicRequire } from '../dynamic-require';
import { IPCChannel } from './ipc-channel';
import { checkParentAlive, IPCEntryPoint } from './ipc-protocol';
import { THEIA_IPC_SERVER } from './ipc-server';

checkParentAlive();

const entryPoint = IPCEntryPoint.getScriptFromEnv();
const ipcServer = process.env[THEIA_IPC_SERVER];
assert(ipcServer !== undefined, `The env variable ${THEIA_IPC_SERVER} is not set!`);
delete process.env[THEIA_IPC_SERVER];
const socket = connect(ipcServer);
const channel = new IPCChannel(socket);

dynamicRequire<{ default: IPCEntryPoint }>(entryPoint).default(channel);

