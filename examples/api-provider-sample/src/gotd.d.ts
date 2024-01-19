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

// Strictly speaking, the 'greeting' namespace is an unnecessary level of organization
// but it serves to illustrate how API namespaces are implemented in the backend.
export namespace greeting {
    export function createGreeter(): Promise<greeting.Greeter>;

    export enum GreetingKind {
        DIRECT = 1,
        QUIRKY = 2,
        SNARKY = 3,
    }

    export interface Greeter extends Disposable {
        greetingKinds: readonly GreetingKind[];

        getMessage(): Promise<string>;

        setGreetingKind(kind: GreetingKind, enable = true): void;

        onGreetingKindsChanged: Event<readonly GreetingKind[]>;
    }
}

export interface Event<T> {
    (listener: (e: T) => unknown, thisArg?: unknown): Disposable;
}

export interface Disposable {
    dispose(): void;
}

namespace Disposable {
    export function create(func: () => void): Disposable;
}
