/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
