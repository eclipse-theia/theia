// *****************************************************************************
// Copyright (C) 2024 EclipseSource and others.
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
import { createProxyIdentifier } from '@theia/plugin-ext/lib/common/rpc-protocol';
import type { greeting } from '../gotd';
import { Event } from '@theia/core';

export enum GreetingKind {
    DIRECT = 1,
    QUIRKY = 2,
    SNARKY = 3,
}

export interface GreeterData {
    readonly uuid: string;
    greetingKinds: greeting.GreetingKind[];
};

export const GreetingMain = Symbol('GreetingMain');
export interface GreetingMain {
    $getMessage(greeterId: string): Promise<string>;

    $createGreeter(): Promise<GreeterData>;
    $destroyGreeter(greeterId: GreeterData['uuid']): Promise<void>;

    $updateGreeter(data: GreeterData): void;
}

export const GreetingExt = Symbol('GreetingExt');
export interface GreetingExt {

    //
    // External protocol
    //

    registerGreeter(): Promise<string>;
    unregisterGreeter(uuid: string): Promise<void>;

    getMessage(greeterId: string): Promise<string>;
    getGreetingKinds(greeterId: string): readonly greeting.GreetingKind[];
    setGreetingKindEnabled(greeterId: string, greetingKind: greeting.GreetingKind, enable: boolean): void;
    onGreetingKindsChanged(greeterId: string): Event<readonly greeting.GreetingKind[]>;

    //
    // Internal protocol
    //

    $greeterUpdated(data: GreeterData): void;

}

export const PLUGIN_RPC_CONTEXT = {
    GREETING_MAIN: createProxyIdentifier<GreetingMain>('GreetingMain'),
};

export const MAIN_RPC_CONTEXT = {
    GREETING_EXT: createProxyIdentifier<GreetingExt>('GreetingExt'),
};
