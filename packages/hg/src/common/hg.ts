/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { ChildProcess } from 'child_process';
import { Disposable } from '@theia/core';
import {
    Repository,
    Branch,
    HgResult,
    CommitWithChanges,
    Remote,
    MergeResult,
    WorkingDirectoryStatus,
} from './hg-model';

/**
 * The WS endpoint path to the Hg service.
 */
export const HgPath = '/services/hg';

/**
 * Hg symbol for DI.
 */
export const Hg = Symbol('Hg');

export namespace Hg {

    /**
     * Options for various Hg commands.
     */
    export namespace Options {

        /**
         * Refinements for the `hg branch` command.
         */
        export namespace BranchCommand {

            /**
             * Option for listing branches in a Hg repository.
             */
            export interface List {

                /**
                 * The type of the branches that has to be listed. If not
                 *  - `current` returns with the name of the currently active branch.
                 *  - `local` lists all locally available branch names.
                 *  - `remote` for listing all remote branches. One might has to perform a `hg fetch` to integrate all the remote branches.
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
         * Hg clone options.
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
         * Hg repositories options.
         */
        export interface Repositories {

            /**
             * The maximum count of repositories to look up, should be greater than 0.
             * Undefined to look up all repositories.
             */
            readonly maxCount?: number;

        }

        /**
         * Options for further `hg checkout` refinements.
         */
        export namespace Checkout {

            /**
             * Options for checking out branches.
             */
            export interface CheckoutBranch {

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
                 * Tree to checkout from. If not specified, the index will be used. `hg checkout -- ./fileName.ext`.
                 * If you want to get the state from the repository ,use `HEAD` which will be equivalent with `hg checkout HEAD -- ./fileName.ext`.
                 */
                readonly treeish?: string;

            }

        }

        /**
         * Options for the `hg commit` command refinement.
         */
        export interface Commit {

            /**
             * If `true` replaces the tip of the current branch by creating a new commit.
             * The recorded tree is prepared as usual, and the message from the original commit is used as the starting point, instead of an empty message,
             * when no other message is specified. The new commit has the same parents and author as the current one. Defaults to `false`.
             */
            readonly amend?: boolean;

            /**
             * If `true` then the commit is marked as 'secret'.  This phase is used for internal commits to save and restore
             * changes in the working directory.
             */
            readonly secret?: boolean;

            /**
             * Adds the `Signed-off-by` line by the committer at the end of the commit log message. `false` by default.
             */
            readonly signOff?: boolean;

        }

        /**
         * Options for further refining the `hg show` command.
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
            readonly commitish?: 'changed' | string;

        }

        /**
         * Options for the `hg fetch` command.
         */
        export interface Fetch {

            /**
             * The name of the remote to fetch from. If not given, then the default remote will be used. Defaults to the `origin`.
             */
            readonly remote?: string;

        }

        /**
         * Further refinements for the `hg push` command.
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
             * The name of the remote branch to push to. If not given then the changes will be pushed to the remote branch associated with the
             * local branch.
             *
             * `hg push <remote> <localBranch>:<remoteBranch>`
             */
            readonly remoteBranch?: string;

            /**
             * Set upstream for every branch that is up to date or successfully pushed,
             * add upstream (tracking) reference, used by argument-less hg-pull and other commands.
             */
            readonly setUpstream?: boolean;

            /**
             * Usually, the command refuses to update a remote ref that is not an ancestor of the local ref used to overwrite it.
             * This flag disables these checks, and can cause the remote repository to lose commits; use it with care.
             */
            readonly force?: boolean;

        }

        /**
         * Options for the `hg pull` command.
         */
        export interface Pull {

            // Note: only one of 'update' and 'rebase' may be true.

            update?: boolean; // run an update after the pull?

            rebase?: boolean; // rebase local changes on top after the pull?

            /**
             * The name of the remote to pull from. If not given, then the default remote will be used. Defaults to the `origin`.
             */
            readonly remote?: string;

            /**
             * The name of the branch to pull form. This is required when one performs a `hg pull` from a remote which is not
             * the default remote tracking of the currently active branch.
             */
            readonly branch?: string;

            bookmarks?: string[];

        }

        /**
         * Additional technical rectifications for the `reset` command.  This is a synthetic command
         * as there is no single hg command that is the equivalent of a Git reset.
         */
        export interface Reset {

            readonly revision: string;

            /**
             * When true, keep the changes in the working tree.
             */
            // readonly keepChanges?: boolean

            /**
             * When true, keep the commit around.
             */
            // readonly keepCommit?: boolean

        }

        /**
         * A set of configuration options that can be passed when executing a low-level Hg command.
         */
        export interface Execution {

            /**
             * The exit codes which indicate success to the caller. Unexpected exit codes will be logged and an
             * error thrown. Defaults to `0` if `undefined`.
             */
            readonly successExitCodes?: ReadonlySet<number>;

            /**
             * An optional collection of key-value pairs which will be
             * set as environment variables before executing the Hg
             * process.
             */
            readonly env?: Object;

            /**
             * An optional string which will be written to the child process
             * stdin stream immediately after spawning the process.
             */
            readonly stdin?: string;

            /**
             * The encoding to use when writing to `stdin`, if the `stdin`
             * parameter is a string.
             */
            readonly stdinEncoding?: string;

            /**
             * The size the output buffer to allocate to the spawned process. Set this
             * if you are anticipating a large amount of output.
             *
             * If not specified, this will be 10MB (10485760 bytes) which should be
             * enough for most Hg operations.
             */
            readonly maxBuffer?: number;

            /**
             * An optional callback which will be invoked with the child
             * process instance after spawning the Hg process.
             *
             * Note that if the `stdin` parameter was specified the `stdin`
             * stream will be closed by the time this callback fires.
             *
             * Defining this property could make the `exec` function invocation **non-client** compatible.
             */
            readonly processCallback?: (process: ChildProcess) => void;

            /**
             * The name for the command based on its caller's context.
             * This could be used only for performance measurements and debugging. It has no runtime behavior effects.
             */
            readonly name?: string;

        }

        /**
         * Range that is used for representing to individual commitish when calculating either `hg log` or `hg diff`.
         */
        export interface Range {

            /**
             * The last revision that should be included among the result running this query. Here, the revision can be a tag, a commitish,
             * or even an expression (`HEAD~3`). For more details to specify the revision, see [here](https://hg-scm.com/docs/hgrevisions#_specifying_revisions).
             */
            readonly toRevision: string;

            /**
             * The first revision that should be included among the result running this query. Here, the revision can be a tag, a commitish,
             * or even an expression (`HEAD~3`). For more details to specify the revision, see [here](https://hg-scm.com/docs/hgrevisions#_specifying_revisions).
             */
            readonly fromRevision: string;

        }

        /**
         * Gonfiguration for the `hg status` command.
         */
        export interface Status {

            /**
             * The revision range that will be used when calculating the list of changed files,
             * or undefined if the working tree file changes are to be returned.
             */
            readonly range?: Range;

            /**
             * The URI of the files in the repository to get the diff. Can be an individual file or a directory.
             */
            readonly uri?: string;

        }

        /**
         * Optional configuration for the `hg log` command.
         */
        export interface Log {

            /**
             * The Git revision range that will be used when calculating the diff.
             */
            readonly range?: Range;

            /**
             * The URI of the files in the repository to get the diff. Can be an individual file or a directory.
             */
            readonly uri?: string;

            /**
             * The name of the branch to run the `hg log` command. If not specified, then the currently active branch will be used.
             */
            readonly branch?: string;

            /**
             * Limits the number of commits. Also known as `-l` or `--limit. If not specified, or not a positive integer, then will be ignored, and the returning list
             * of commits will not be limited.
             */
            readonly maxCount?: number;

            fullCommitMessages?: boolean,

            dates?: string,

            gitExtendedDiffs?: boolean,

            revision?: string,

            follow?: boolean,

            readonly revQuery?: string,
        }

        /**
         * Options for the `hg remote` command.
         */
        export interface Paths {

            /**
             * Name of the remote to get, or undefined to list all remotes.
             */
            readonly name?: string,

        }

        /**
         * Further refinements for the `hg revert`.
         */
        export interface Revert {

            /**
             * If undefined, revert to the parent of the working tree,
             * i.e. this discards working tree changes.
             */
            readonly revision?: string;

            /**
             * If undefined, all files are reverted.
             */
            readonly uris?: string[];

        }

        /**
         * Further refinements for the `hg update`.
         */
        export interface Update {

            readonly clean?: true;

            readonly check?: true;

            readonly revision?: string;

        }

    }
}

/**
 * Provides basic functionality for Hg.
 */
export interface Hg extends Disposable {

    /**
     * Clones a remote repository into the desired local location.
     *
     * @param remoteUrl the URL of the remote.
     * @param options the clone options.
     */
    clone(remoteUrl: string, options: Hg.Options.Clone): Promise<Repository>;

    /**
     * Resolves to an array of repositories discovered in the workspace given with the workspace root URI.
     */
    repositories(workspaceRootUri: string, options: Hg.Options.Repositories): Promise<Repository[]>;

    /**
     * Returns with the list of files that have been changed between one revision and
     * another.  If no options are specified then the working directory status is returned.
     *
     * @param repository the repository to get the changeset status from.
     */
    status(repository: Repository, options?: Hg.Options.Status): Promise<WorkingDirectoryStatus>;

    /**
     * Stages the given file or files in the working clone. The invocation will be rejected if
     * any files (given with their file URIs) is not among the changed files.
     *
     * @param repository the repository to stage the files.
     * @param uri one or multiple file URIs to stage in the working clone.
     */
    add(repository: Repository, uris: string[]): Promise<void>;

    /**
     * Removes the given file or files among the staged files in the working clone. The invocation will be rejected if
     * any files (given with their file URIs) is not among the staged files.
     *
     * @param repository the repository to where the staged files have to be removed from.
     * @param uri one or multiple file URIs to unstage in the working clone. If the array is empty, all the changed files will be staged.
     * @param options optional refinements for the the unstaging operation.
     */
    forget(repository: Repository, uris: string[]): Promise<void>;

    /**
     * Returns with the currently active branch, or `undefined` if the current branch is in detached mode.
     *
     * @param repository the repository where the current branch has to be queried.
     */
    currentBranch(repository: Repository): Promise<Branch | undefined>;

    /**
     * Returns with an array of branches.
     *
     * @param repository the repository where the branches has to be queried.
     */
    branches(repository: Repository): Promise<Branch[]>;

    /**
     * Creates, renames, and deletes a branch.
     *
     * @param the repository where the branch modification has to be performed.
     * @param branchName The desired name of the new branch.
     */
    createBranch(repository: Repository, branchName: string): Promise<void>

    /**
     * Switches branches or restores working tree files.
     *
     * @param repository the repository to where the `hg checkout` has to be performed.
     * @param options further checkout options.
     */
    checkout(repository: Repository, options: Hg.Options.Checkout.CheckoutBranch | Hg.Options.Checkout.WorkingTreeFile): Promise<void>;

    /**
     * Commits the changes of all staged files in the working directory.
     *
     * @param repository the repository where the staged changes has to be committed.
     * @param message the optional commit message.
     */
    commit(repository: Repository, message?: string, options?: Hg.Options.Commit): Promise<void>;

    /**
     * Updates the `refs` using local `refs`, while sending objects necessary to complete the given `refs` by pushing
     * all committed changed from the local Hg repository to the `remote` one.
     *
     * @param repository the repository to push to.
     * @param options optional refinements for the `hg push` command.
     */
    push(repository: Repository, options?: Hg.Options.Push): Promise<void>;

    /**
     * Fetches from and integrates with another repository. It incorporates changes from a repository into the current branch.
     * In its default mode, `hg pull` is shorthand for `hg fetch` followed by `hg merge FETCH_HEAD`.
     *
     * @param repository the repository to pull from.
     * @param options optional refinements for the `hg pull` command.
     */
    pull(repository: Repository, options?: Hg.Options.Pull): Promise<void>;

    /**
     * Resets the parent of the working directory to the specified commit.
     * The working directory is left unchanged.
     *
     * Note that this is a synchetic command because Mercurial has no 'reset' command.
     *
     * @param repository the repository which state has to be reset.
     * @param options further clarifying the `hg reset` command.
     */
    reset(repository: Repository, options: Hg.Options.Reset): Promise<void>;

    /**
     * Merges the given branch into the currently active branch.
     *
     * @param repository the repository to merge from.
     * @param options `hg merge` command refinements.
     */
    merge(repository: Repository, revQuery: string): Promise<MergeResult>;

    /**
     * Retrieves and shows the content of a resource from the repository at a given reference, commit, or tree.
     * Resolves to a promise that will produce a string containing the contents of the file or an error if the file does not exists in the given revision.
     *
     * @param repository the repository to get the file content from.
     * @param uri the URI of the file who's content has to be retrieved and shown.
     * @param options the options for further refining the `hg show`.
     */
    show(repository: Repository, uri: string, options?: Hg.Options.Show): Promise<string>;

    paths(repository: Repository, options?: Hg.Options.Paths): Promise<Remote[]>;

    /**
     * Executes the Hg command and resolves to the result. If an executed Hg command exits with a code that is not in the `successExitCodes` or an error not in `expectedErrors`,
     * a `HgError` will be thrown.
     *
     * @param repository the repository where one can execute the command. (Although the repository path is not necessarily mandatory for each Hg commands,
     * such as `hg config -l`, or `hg --version`, we treat the repository as a required argument to have a symmetric API.)
     * @param args the array of arguments for Hg.
     * @param options options can be used to tweaked additional configurations for the low-level command execution.
     */
    exec(repository: Repository, args: string[], options?: Hg.Options.Execution): Promise<HgResult>;

    /**
     * Returns a list with commits and their respective file changes.
     *
     * @param repository the repository where the log has to be calculated.
     * @param options optional configuration for further refining the `hg log` command execution.
     */
    log(repository: Repository, options?: Hg.Options.Log): Promise<CommitWithChanges[]>;

    /**
     * Resolves to `true` if the file is managed by the Hg repository. Otherwise, `false`.
     */
    lsFiles(repository: Repository, uri: string): Promise<boolean>;

    reset(repository: Repository, options?: Hg.Options.Reset): Promise<void>;

    revert(repository: Repository, options: Hg.Options.Revert): Promise<void>;

    update(repository: Repository, options?: Hg.Options.Update): Promise<void>;

}

/**
 * Contains a set of utility functions for [Hg](#Hg).
 */
export namespace HgUtils {

    /**
     * `true` if the argument is an option for checking out a new local branch.
     */
    // tslint:disable-next-line:no-any
    export function isBranchCheckout(arg: any | undefined): arg is Hg.Options.Checkout.CheckoutBranch {
        return !!arg && ('branch' in arg);
    }

    /**
     * The error code for when the path to a repository doesn't exist.
     */
    const RepositoryDoesNotExistErrorCode = 'repository-does-not-exist-error';

    /**
     * `true` if the argument is an error indicating the absence of a local Hg repository.
     * Otherwise, `false`.
     */
    // tslint:disable-next-line:no-any
    export function isRepositoryDoesNotExistError(error: any | undefined): boolean {
        // TODO this is odd here.This piece of code is already implementation specific, so this should go to the Hg API.
        // But how can we ensure that the `any` type error is serializable?
        if (error instanceof Error && ('code' in error)) {
            // tslint:disable-next-line:no-any
            return (<any>error).code === RepositoryDoesNotExistErrorCode;
        }
        return false;
    }

}
