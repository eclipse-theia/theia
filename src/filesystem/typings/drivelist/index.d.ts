/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

declare module 'drivelist' {
    export interface Drive {
        /**
         * '/dev/disk1'
         */
        device: string;
        /**
         * 'Macintosh HD'
         */
        description: string;
        /**
         * [{path: '/'}, {path: 'c:'}]
         */
        mountpoints: { path: string }[];
        size: number;
        raw: string;
        protected: boolean;
        system: boolean;
    }
    export function list(cb: (error: Error | undefined, drives: Drive[]) => void): void;
}