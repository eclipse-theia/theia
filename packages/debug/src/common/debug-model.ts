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

import {Disposable} from '@theia/core';
// import {DebugProtocol} from 'vscode-debugprotocol';

/**
 * The WS endpoint path to the Debug service.
 */
export const DebugPath = '/services/debug';

/**
 * Debug symbol for DI.
 */
export const Debug = Symbol('Debug');

// export namespace Debug {
//     export interface InitializeEvent extends DebugProtocol.InitializedEvent {
//     }
// }

/**
 * Provides functionality for Debug.
 */
export interface Debug extends Disposable {
    doSomething(param: string): void;
}
