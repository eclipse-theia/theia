/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Disposable } from '@theia/core/lib/common';
import { Repository, WorkingDirectoryStatus } from './model';

export interface Git {

    /**
     * Returns with the working directory status of the given Git repository.
     */
    status(repository: Repository): Promise<WorkingDirectoryStatus>;

    /**
     * Attaches a status change listener onto the given Git repository. One has the dispose the returned `disposable`
     * to unsubscribe from the status change event.
     */
    onStatusChange(repository: Repository, callback: (status: WorkingDirectoryStatus) => void): Promise<Disposable>;

}
