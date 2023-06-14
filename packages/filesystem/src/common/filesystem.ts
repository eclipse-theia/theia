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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export namespace FileAccess {

    export namespace Constants {

        /**
         * Flag indicating that the file is visible to the calling process.
         * This is useful for determining if a file exists, but says nothing about rwx permissions. Default if no mode is specified.
         */
        export const F_OK: number = 0;

        /**
         * Flag indicating that the file can be read by the calling process.
         */
        export const R_OK: number = 4;

        /**
         * Flag indicating that the file can be written by the calling process.
         */
        export const W_OK: number = 2;

        /**
         * Flag indicating that the file can be executed by the calling process.
         * This has no effect on Windows (will behave like `FileAccess.F_OK`).
         */
        export const X_OK: number = 1;
    }
}
