/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { FileChange, Repository, WorkingDirectoryStatus } from './model';

export interface Git {

    /**
     * Returns with the working directory status of the given Git repository.
     *
     * @param the repository to get the working directory status from.
     */
    status(repository: Repository): Promise<WorkingDirectoryStatus>;

    /**
     * Stages the given file or files in the working clone. The invocation will be rejected if
     * any files (given with their file URIs) is not among the changed files.
     *
     * @param repository the repository to stage the files.
     * @param file one or multiple file URIs to stage in the working clone.
     */
    stage(repository: Repository, file: string | string[]): Promise<void>;

    /**
     * Resolves to a list a file changes, representing all the staged files in the working directory.
     * 
     * @param repository the repository to get all staged files from.
     */
    stagedFiles(repository: Repository): Promise<FileChange[]>;

    /**
     * Commits the changes of all staged files in the working directory.
     *
     * @param repository the repository where the staged changes has to be committed.
     * @param message the mandatory commit message.
     */
    commit(repository: Repository, message: string): Promise<boolean>;

    /**
     * Registers a working directory status changes listener for the given Git repository.
     * 
     * If multiple identical `listener` instances are registered on the same `Repository` with the same parameters,
     * the duplicate instances are discarded. They do not cause the `listener` to be called twice, and they do not 
     * need to be removed manually with the `off('statusChange' repository, listener)` method.
     *
     * @param event the string representation of the event to listen for.
     * @param repository the repository to listen on working directory changes.
     * @param listener the object which receives a working directory change notification.
     */
    on(event: 'statusChange', repository: Repository, listener: (status: WorkingDirectoryStatus) => void): Promise<void>;

    /**
     * Counterpart of the `on('statusChange' repository, listener)` method. Removes the given working directory status change listener
     * from the given repository. Has no side effect if the `listener` was not yet registered previously.
     *
     * @param event the string representation of the event to remove the listener from.
     * @param repository the repository to stop listening on working directory changes.
     * @param listener the object which should be unsubscribed from the working directory change events.
     */
    off(event: 'statusChange', repository: Repository, listener: (status: WorkingDirectoryStatus) => void): Promise<void>;

}
