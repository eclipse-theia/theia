/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

export = mv;
declare module mv { }
type MvOptions = { mkdirp?: boolean, clobber?: boolean, limit?: number };
declare function mv(sourcePath: string, targetPath: string, options?: MvOptions, cb?: (error: NodeJS.ErrnoException) => void): void;

