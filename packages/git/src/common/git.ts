/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Repository, WorkingDirectoryStatus } from './model';

/**
 * The WS endpoint path to the Git service.
 */
export const GitPath = '/services/git';

/**
 * Git symbol for DI.
 */
export const Git = Symbol('Git');


export namespace Git {

    /**
     * Options for various Git commands.
     */
    export namespace Options {

        /**
         * Refinements for the `git branch` command.
         */
        export namespace Branch {

            /**
             * Option for listing branches in a Git repository.
             */
            export interface List {

                /**
                 * The type of the branches that has to be listed. If not
                 *  - `current` returns with the name of the currently active branch.
                 *  - `local` lists all locally available branch names.
                 *  - `remote` for listing all remote branches. One might has to perform a `git fetch` to integrate all the remote branches.
                 *  - `all` lists all remote and local branches including the currently active one.
                 */
                readonly type: 'current' | 'local' | 'remote' | 'all';

            }

            /**
             * Option for creating a new branch.
             */
            export interface Create {

                /**
                 * The desired name of the new branch.
                 */
                readonly toCreate: string;

                /**
                 * The new branch head will point to this commit. It may be given as a branch name, a commit-id, or a tag.
                 * If this option is omitted, the current `HEAD` will be used instead.
                 */
                readonly startPoint?: string;

            }

            /**
             * Option for deleting a branch. The branch must be fully merged in its upstream branch, or in `HEAD` if no upstream was set.
             */
            export interface Delete {

                /**
                 * The name of the branch to delete.
                 */
                readonly toDelete: string;

                /**
                 * When set to `true`, then allows deleting the branch irrespective of its merged status. `false` by default.
                 */
                readonly force?: boolean;

                /**
                 * When set to `true` then deletes the remote-tracking branches as well. It is `false` by default.
                 */
                readonly remote?: boolean;

            }

            /**
             * Option for renaming an existing branch.
             */
            export interface Rename {

                /**
                 * The desired new name of the branch.
                 */
                readonly newName: string;

                /**
                 * The name of the branch to rename. If not given, then the currently active branch will be renamed.
                 */
                readonly oldName?: string;

                /**
                 * If set to `true`, the allows renaming the branch even if the new branch name already exists. It is `false` by default.
                 */
                readonly force?: boolean;

            }

        }

        /**
         * Git clone options.
         */
        export interface Clone {

            /**
             * The desired destination path (given as a URI) for the cloned repository.
             * If the path does not exist it will be created. Cloning into an existing
             * directory is only allowed if the directory is empty.
             */
            readonly localUri: string;

            /**
             * The branch to checkout after the clone has completed. If not given,
             * the default branch will will be the current one which is usually the `master`.
             */
            readonly branch?: string;

        }

        /**
         * Options for further `git checkout` refinements.
         */
        export namespace Checkout {

            /**
             * Options for checking out branches.
             */
            export interface Branch {

                /**
                 * Branch to checkout; if it refers to a branch, then that branch is checked out.
                 * Otherwise, if it refers to a valid commit, your `HEAD` becomes "detached" and you are no
                 * longer on any branch.
                 */
                readonly branch: string;

                /**
                 * When switching branches, proceed even if the index or the working tree differs from `HEAD`.
                 * This is used to throw away local changes.
                 */
                readonly force?: boolean;

                /**
                 * When switching branches, if you have local modifications to one or more files that are different
                 * between the current branch and the branch to which you are switching, the command refuses to
                 * switch branches in order to preserve your modifications in context. However, with this option,
                 * a three-way merge between the current branch, your working tree contents, and the new branch is done,
                 * and you will be on the new branch.
                 */
                readonly merge?: boolean;


                /**
                 * The name for the new local branch.
                 */
                readonly newBranch?: string;

            }

            /**
             * Options for checking out files from the working tree.
             *
             *  - When trying to revert a resource to the state of the index, set `paths`.
             *  - When trying to revert the state of a resource to the repository `HEAD`, then set `paths` and `treeish` to `HEAD`.
             *  - If you would like to check out the state of a file from the `HEAD` of a branch, set `treeish` to `nameOfTheBranch`.
             *  - And if you would like to check out a historical revision of a branch, set `treeish` to `nameOfTheBranch~2` which will be
             *      two commits before the most recent one on the desired branch.
             */
            export interface WorkingTreeFile {

                /**
                 * This is used to restore modified or deleted paths to their original contents from the index or replace
                 * paths with the contents from a named tree-ish (most often a commit-ish).
                 *
                 * One can specify a regular expression for the paths, in such cases, it must be escaped with single-quotes.
                 * For instance checking out a `Hello.ts` file will be simply `"Hello.ts"`, if one would like to checkout
                 * all TS files, then this for should be used: ```ts
                 * const options = {
                 *   paths: `'*.ts'`
                 * }
                 * ```.
                 */
                readonly paths: string | string[];

                /**
                 * When checking out paths from the index, do not fail upon unmerged entries; instead, unmerged
                 * entries are ignored.
                 */
                readonly force?: boolean;

                /**
                 * When checking out paths from the index, this option lets you recreate the conflicted merge in the
                 * specified paths.
                 */
                readonly merge?: boolean;

                /**
                 * Tree to checkout from. If not specified, the index will be used. `git checkout -- ./fileName.ext`.
                 * If you want to get the state from the repository ,use `HEAD` which will be equivalent with `git checkout HEAD -- ./fileName.ext`.
                 */
                readonly treeish?: string;

            }

        }

        /**
         * Options for further refining the `git show` command.
         */
        export interface Show {

            /**
             * The desired encoding which should be used when retrieving the file content.
             * `utf8` should be used for text content and `binary` for blobs. The default one is `utf8`.
             */
            readonly encoding?: 'utf8' | 'binary';

            /**
             * A commit SHA or some other identifier that ultimately dereferences to a commit/tree.
             * `HEAD` is the local `HEAD`, and `index` is the the staged. If not specified,
             * then `index` will be used instead. But this can be `HEAD~2` or `ed14ef1~1` where `ed14ef1` is a commit hash.
             */
            readonly commitish?: 'index' | string;

        }

        /**
         * Options for the `git fetch` command.
         */
        export interface Fetch {

            /**
             * The name of the remote to fetch from. If not given, then the default remote will be used. Defaults to the `origin`.
             */
            readonly remote?: string;

        }

        /**
         * Further refinements for the `git push` command.
         */
        export interface Push {

            /**
             * The name of the remote to push to. If not given, then the default remote will be used. It is the `origin` by default.
             */
            readonly remote?: string;

            /**
             * The name of the local branch to push. If not given, then the currently active branch will be used instead.
             */
            readonly localBranch?: string;

            /**
             * The name of the remote branch to push to. If not given then teh changes will be pushed to the remote branch associated with the
             * local branch.
             *
             * `git push <remote> <localBranch>:<remoteBranch>`
             */
            readonly remoteBranch?: string;

        }

        /**
         * Options for the `git pull` command.
         */
        export interface Pull {

            /**
             * The name of the remote to pull from. If not given, then the default remote will be used. Defaults to the `origin`.
             */
            readonly remote?: string;

        }

        /**
         * Additional technical rectifications for the `git reset` command.
         */
        export interface Reset {

            /**
             * The `git reset` mode. The followings are supported:
             *  - `hard`,
             *  - `sort`, or
             *  - `mixed`.
             *
             * Those correspond to the consecutive `--hard`, `--soft`, and `--mixed` Git options.
             */
            readonly mode: 'hard' | 'soft' | 'mixed';

            /**
             * The reference to reset to. By default, resets to `HEAD`.
             */
            readonly ref?: string;

        }

        /**
         * Additional options for the `git merge` command.
         */
        export interface Merge {

            /**
             * The name of the branch that should be merged into the current branch.
             */
            readonly branch: string;

        }

    }

}

/**
 * Provides basic functionality for Git.
 */
export interface Git {

    /**
     * Clones a remote repository into the desired local location.
     *
     * @param remoteUrl the URL of the remote.
     * @param options the clone options.
     */
    clone(remoteUrl: string, options: Git.Options.Clone): Promise<Repository>;

    /**
     * Resolves to an array of repositories discovered in the workspace given with the workspace root URI.
     */
    repositories(workspaceRootUri: string): Promise<Repository[]>;

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
    unstage(repository: Repository, uri: string | string[]): Promise<void>;

    /**
     * Lists, creates, renames or deletes a branch.
     *
     *  - It returns with either `undefined`, or a `string` or an array of `string`s when listing the branches. A single
     * `string` value will be provided if the `type` is `current`. It returns with `undefined` if the current branch is detached.
     * Otherwise it returns with an array of branch names.
     *  - It returns with a promise that resolves to `void` when creating, renaming or deleting a branch.
     *
     * @param the repository to get the active branch from.
     * @param type the type of the query to run. The default type is `current`.
     */
    branch(repository: Repository, options:
        Git.Options.Branch.List |
        Git.Options.Branch.Create |
        Git.Options.Branch.Rename |
        Git.Options.Branch.Delete): Promise<void | undefined | string | string[]>;

    /**
     * Switches branches or restores working tree files.
     *
     * @param repository the repository to where the `git checkout` has to be performed.
     * @param options further checkout options.
     */
    checkout(repository: Repository, options: Git.Options.Checkout.Branch | Git.Options.Checkout.WorkingTreeFile): Promise<void>;

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
     * @param options optional options for `git fetch` refinement.
     */
    fetch(repository: Repository, options?: Git.Options.Fetch): Promise<void>;

    /**
     * Updates the `refs` using local `refs`, while sending objects necessary to complete the given `refs` by pushing
     * all committed changed from the local Git repository to the `remote` one.
     *
     * @param repository the repository to push to.
     * @param options optional refinements for the `git push` command.
     */
    push(repository: Repository, options?: Git.Options.Push): Promise<void>;

    /**
     * Fetches from and integrates with another repository. It incorporates changes from a repository into the current branch.
     * In its default mode, `git pull` is shorthand for `git fetch` followed by `git merge FETCH_HEAD`.
     *
     * @param repository the repository to pull from.
     * @param options optional refinements for the `git pull` command.
     */
    pull(repository: Repository, options?: Git.Options.Pull): Promise<void>;

    /**
     * Resets the current `HEAD` of the entire working directory to the specified state.
     *
     * @param repository the repository which state has to be reset.
     * @param options further clarifying the `git reset` command.
     */
    reset(repository: Repository, options: Git.Options.Reset): Promise<void>;

    /**
     * Merges the given branch into the currently active branch.
     *
     * @param repository the repository to merge from.
     * @param options `git merge` command refinements.
     */
    merge(repository: Repository, options: Git.Options.Merge): Promise<void>;

    /**
     * Retrieves and shows the content of a resource from the repository at a given reference, commit, or tree.
     * Resolves to a promise that will produce a string containing the contents of the file or an error if the file does not exists in the given revision.
     *
     * @param repository the repository to get the file content from.
     * @param uri the URI of the file who's content has to be retrieved and shown.
     * @param options the options for further refining the `git show`.
     */
    show(repository: Repository, uri: string, options?: Git.Options.Show): Promise<string>;

    /**
     * Without any arguments, it resolves to a list of configured remotes. If no remotes are set,
     * resolves to an empty array.
     */
    remote(repository: Repository): Promise<string[]>;

}

/**
 * Contains a set of utility functions for [Git](#Git).
 */
export namespace GitUtils {

    /**
     * `true` if the argument is an option for renaming an existing branch in the repository.
     */
    export function isBranchRename(arg: any | undefined): arg is Git.Options.Branch.Rename {
        return !!arg && ('newName' in arg);
    }

    /**
     * `true` if the argument is an option for deleting an existing branch in the repository.
     */
    export function isBranchDelete(arg: any | undefined): arg is Git.Options.Branch.Delete {
        return !!arg && ('toDelete' in arg);
    }

    /**
     * `true` if the argument is an option for creating a new branch in the repository.
     */
    export function isBranchCreate(arg: any | undefined): arg is Git.Options.Branch.Create {
        return !!arg && ('toCreate' in arg);
    }

    /**
     * `true` if the argument is an option for listing the branches in a repository.
     */
    export function isBranchList(arg: any | undefined): arg is Git.Options.Branch.List {
        return !!arg && ('type' in arg);
    }

    /**
     * `true` if the argument is an option for checking out a new local branch.
     */
    export function isBranchCheckout(arg: any | undefined): arg is Git.Options.Checkout.Branch {
        return !!arg && ('branch' in arg);
    }

    /**
     * `true` if the argument is an option for checking out a working tree file.
     */
    export function isWorkingTreeFileCheckout(arg: any | undefined): arg is Git.Options.Checkout.WorkingTreeFile {
        return !!arg && ('paths' in arg);
    }

}

