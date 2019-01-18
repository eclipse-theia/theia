/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

declare module 'nsfw' {
    function nsfw(dir: string, eventHandler: (events: nsfw.ChangeEvent[]) => void, options?: nsfw.Options): Promise<nsfw.NSFW>;

    namespace nsfw {
        export interface NSFW {
            start(): Promise<void>;
            stop(): Promise<void>;
        }

        export interface Options {
            debounceMS?: number;
            errorCallback?: (error: string) => void;
        }

        export interface ChangeEvent {
            action: number;
            directory: string;
            file?: string;
            oldFile?: string;
            newFile?: string;
        }

        export enum actions {
            CREATED,
            DELETED,
            MODIFIED,
            RENAMED,
        }
    }

    export = nsfw;
}
