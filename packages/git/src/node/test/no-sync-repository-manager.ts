/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import { Repository } from '../../common/git-model';
import { GitRepositoryManager } from '../git-repository-manager';

/**
 * Repository manager that does not synchronizes the status. For testing purposes.
 */
@injectable()
export class NoSyncRepositoryManager extends GitRepositoryManager {

    protected async ensureSync<T>(repository: Repository, result: Promise<T>): Promise<T> {
        return result;
    }

}
