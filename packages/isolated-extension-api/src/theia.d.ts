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

declare module 'theia' {

    export class Disposable {

        constructor(func: () => void);
        /**
         * Dispose this object.
         */
        dispose(): void;

        static create(func: () => void): Disposable;

    }

    /**
     * A command is a unique identifier of a function
     * which can be executed by a user via a keyboard shortcut,
     * a menu action or directly.
     */
    export interface Command {
        /**
         * A unique identifier of this command.
         */
        id: string;
        /**
         * A label of this command.
         */
        label?: string;
        /**
         * An icon class of this command.
         */
        iconClass?: string;
    }
    export namespace commands {
        export function registerCommand(command: Command, callback: (...args: any[]) => any): Disposable
    }
}