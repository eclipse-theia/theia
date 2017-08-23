/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Account, Repository, RepositoryWithRemote, WorkingDirectoryStatus } from './model';

/**
 * The WS endpoint path to the Git.
 */
export const GitPath = '/services/git';

/**
 * Git symbol for DI.
 */
export const Git = Symbol('Git');

/**
 * Provides basic functionality for Git.
 *
 * TODOs:
 *  - static factory method for cloning. clone(localUri: string, remoteUrl: string): Promise<Repository>
 *  - register/remove repositories that are currently outside of the workspace but user wants to track the changes.
 *  - replace with HEAD (aka discard) should be supported by the `checkout` method.
 *  - get file content from HEAD as a string that can be reused by the diff-editor later. (first iteration)
 */
export interface Git {

    /**
     * Resolves to an array of repositories discovered in the workspace.
     */
    repositories(): Promise<Repository[]>;

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
     * @param uri one or multiple file URIs to stage in the working clone.
     */
    add(repository: Repository, uri: string | string[]): Promise<void>;

    /**
     * Removes the given file or files among the staged files in the working clone. The invocation will be rejected if
     * any files (given with their file URIs) is not among the staged files.
     *
     * @param repository the repository to where the staged files have to be removed from/
     * @param uri one or multiple file URIs to unstage in the working clone.
     */
    rm(repository: Repository, uri: string | string[]): Promise<void>;

    /**
     * Returns with the name of the branches from the repository. Will be rejected if the repository does not exist.
     * This method will be resolved to a `string` if the `type === 'current`. If the repository has a detached `HEAD`,
     * instead of returning with `(no branch)` it resolves to `undefined`. Otherwise, it will be resolved to an array of
     * branch names.
     *
     * @param the repository to get the active branch from.
     * @param type the type of the query to run. The default type is `current`.
     */
    branch(repository: Repository, type?: 'current' | 'local' | 'remote' | 'all'): Promise<undefined | string | string[]>;

    /**
     * Creates a new branch in the repository.
     *
     * @param repository the repository where the new branch has to be created.
     * @param name the name of the new branch.
     * @param startPoint the commit SH that the new branch should be based on, or `undefined` if the branch should be created based off of the current state of `HEAD`.
     */
    createBranch(repository: Repository, name: string, startPoint?: string): Promise<void>;

    /**
     * Renames an existing branch in the repository.
     *
     * @param repository the repository where the renaming has to be performed.
     * @param name the current name of the branch to rename.
     * @param newName the desired name of the branch.
     */
    renameBranch(repository: Repository, name: string, newName: string): Promise<void>;

    /**
     * Deletes an existing branch in the repository.
     *
     * @param repository the repository where the branch has to be deleted.
     * @param name the name of the existing branch to delete.
     */
    deleteBranch(repository: Repository, name: string): Promise<void>;

    /**
     * Switches to a branch in the repository.
     *
     * @param repository the repository to which the branch has to be switched to.
     * @param localName if specified, the remote branch will be pulled in with this, desired, name. Ignored when the branch already exists locally.
     * @param name the name of the repository to switch to.
     */
    checkout(repository: Repository, name: string, localName?: string): Promise<void>;

    /**
     * Commits the changes of all staged files in the working directory.
     *
     * @param repository the repository where the staged changes has to be committed.
     * @param message the optional commit message.
     */
    commit(repository: Repository, message?: string): Promise<void>;

    /**
     * Fetches branches and/or tags (collectively, `refs`) from the repository, along with the objects necessary to complete their histories.
     * The remotely-tracked branches will be updated too.
     *
     * @param repository the repository to fetch from.
     * @param account the account when authentication is required by the `remote` when fetching.
     */
    fetch(repository: RepositoryWithRemote, account?: Account): Promise<void>;

    /**
     * Updates the remote `refs` using local `refs`, while sending objects necessary to complete the given `refs` by pushing
     * all committed changed from the local Git repository to the `remote` one.
     *
     * @param repository the remote repository to push to.
     * @param account the account that is used for the authentication on the `remote` when performing the `git pull`.
     */
    push(repository: RepositoryWithRemote, account: Account): Promise<void>;

    /**
     * Fetches from and integrates with another remote repository. It incorporates changes from a remote repository into the current branch.
     * In its default mode, `git pull` is shorthand for `git fetch` followed by `git merge FETCH_HEAD`.
     *
     * @param repository the remote repository to pull from.
     * @param account the account when authenticating the user on the `remote`.
     */
    pull(repository: RepositoryWithRemote, account?: Account): Promise<void>;

    /**
     * Resets the current `HEAD` of the entire working directory to the specified state.
     *
     * @param repository the repository which state has to be reset.
     * @param mode the reset mode. The followings are supported: `hard`, `sort`, or `mixed`. Those correspond to the consecutive `--hard`, `--soft`, and `--mixed`.
     * @param ref the reference to reset to. By default, resets to `HEAD`.
     */
    reset(repository: Repository, mode: 'hard' | 'soft' | 'mixed', ref?: string): Promise<void>;

    /**
     * Merges the given branch into the currently active branch.
     *
     * @param repository the repository to merge from.
     * @param name the name of the branch to merge into the current one.
     */
    merge(repository: Repository, name: string): Promise<void>;

    /**
     * Reapplies commits on top of another base tip to the current branch.
     *
     * @param repository the repository to get the commits from.
     * @param name the name of the branch to retrieve the commits and reapplies on the current branch tip.
     */
    rebase(repository: Repository, name: string): Promise<void>;

}
