// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics and others.
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

import { addExtension } from 'msgpackr';

/**
 * Handles the global registration of custom MsgPackR extensions
 * required for the default RPC communication. MsgPackR extensions
 * are installed globally on both ends of the communication channel.
 * (frontend-backend, pluginExt-pluginMain).
 * Is implemented as singleton as it is also used in plugin child processes which have no access to inversify.
 */
export class MsgPackExtensionManager {
    private static readonly INSTANCE = new MsgPackExtensionManager();
    public static getInstance(): MsgPackExtensionManager {
        return this.INSTANCE;
    }

    private extensions = new Map<number, MsgPackExtension>();

    private constructor() {
    }

    registerExtensions(...extensions: MsgPackExtension[]): void {
        extensions.forEach(extension => {
            if (extension.tag < 1 || extension.tag > 100) {
                // MsgPackR reserves the tag range 1-100 for custom extensions.
                throw new Error(`MsgPack extension tag should be a number from 1-100 but was '${extension.tag}'`);
            }
            if (this.extensions.has(extension.tag)) {
                throw new Error(`Another MsgPack extension with the tag '${extension.tag}' is already registered`);
            }
            this.extensions.set(extension.tag, extension);
            addExtension({
                Class: extension.class,
                type: extension.tag,
                write: instance => extension.serialize(instance),
                read: serialized => extension.deserialize(serialized)
            });
        });
    }

    getExtension(tag: number): MsgPackExtension | undefined {
        return this.extensions.get(tag);
    }
}

export interface MsgPackExtension {
    class: Function,
    tag: number,
    serialize(instance: unknown): unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deserialize(serialized: any): unknown
}

export type Constructor<T> = new (...params: unknown[]) => T;

