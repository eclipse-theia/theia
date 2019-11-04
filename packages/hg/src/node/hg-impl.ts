/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { ILogger } from '@theia/core';
import {
    Hg, HgUtils, Repository, HgFileChange, HgFileStatus, Branch, Commit,
    CommitIdentity, HgResult, CommitWithChanges, Remote, BranchType, MergeResult
} from '../common';
import { HgRepositoryManager } from './hg-repository-manager';
import { HgLocator } from './hg-locator/hg-locator-protocol';
import { HgInit } from './init/hg-init';
import * as hg from './hg';
import { HGRepo, getHgRepo } from './hg';
import { FileSystem } from '@theia/filesystem/lib/common';
import * as fs from 'fs-extra';
import { Path as TheiaPath } from '@theia/core';
import { relative } from 'path';
import { HgPromptServerImpl } from './hg-prompt';
import { HgPrompt } from '../common/hg-prompt';
import URI from '@theia/core/lib/common/uri';

/**
 * Hg implementation.
 */
@injectable()
export class HgImpl implements Hg {

    protected readonly limit = 1000;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(HgLocator)
    protected readonly locator: HgLocator;

    @inject(FileSystem) protected readonly filesystem: FileSystem;

    @inject(HgRepositoryManager)
    protected readonly manager: HgRepositoryManager;

    @inject(HgInit)
    protected readonly hgInit: HgInit;

    @inject(HgPromptServerImpl)
    protected readonly promptServer: HgPromptServerImpl;

    dispose(): void {
        this.locator.dispose();
        this.hgInit.dispose();
    }

    async clone(remoteUrl: string, options: Hg.Options.Clone): Promise<Repository> {
        const localPath = FileUri.fsPath(options.localUri);
        await hg.clone(this.hgInit, remoteUrl, localPath, []);
        const repository = { localUri: options.localUri };
        await this.addHgExtensions(repository);
        return repository;
    }

    private async addHgExtensions(repository: Repository): Promise<void> {
        const fileUri = `${repository.localUri}/.hg/hgrc`;
        const filePath = FileUri.fsPath(fileUri);
        if (fs.existsSync(filePath)) {
            const fileContent = await fs.readFile(filePath, 'utf-8');

            const lines = fileContent.split(/\r\n|\n|\r/);

            if (!lines.some(line => line === '[extensions]')) {
                lines.push('[extensions]', 'strip =');
            } else if (!lines.some(line => line === 'strip =')) {
                const sectionIndex = lines.indexOf('[extensions]');
                lines.splice(sectionIndex + 1, 0, 'strip =');
            }

            const output = lines.reduce((lines1, lines2) => lines1 + '\n' + lines2);
            await fs.writeFile(filePath, output, { encoding: 'utf-8' });
        } else {
            const lines = ['[extensions]', 'strip ='];

            const newContent: string = lines.join('\n');
            await fs.writeFile(filePath, newContent, { encoding: 'utf-8' });
        }
    }

    async repositories(workspaceRootUri: string, options: Hg.Options.Repositories): Promise<Repository[]> {
        const dir = await this.filesystem.getFileStat(workspaceRootUri);
        if (!dir || !dir.children) {
            return Promise.reject(new Error('An error occurred when getting children of directory.'));
        }

        const hgRepositories = dir.children
            .filter(f => f.isDirectory)
            .map(f => this.isRepository(new TheiaPath(f.uri)).then(e => ({ f, e })));

        const exists = await Promise.all(hgRepositories);

        const result = exists.filter(pair => pair.e)
            .map(pair => ({ localUri: pair.f.uri }));

        if (options.maxCount && result.length > options.maxCount) {
            return result.slice(0, options.maxCount);
        } else {
            return result;
        }
    }

    /**
     * Returns true if the given path points to the root of a Mercurial repository.
     * @param directoryPath
     */
    public isRepository(directoryPath: TheiaPath): Promise<boolean> {
        return this.filesystem.exists(directoryPath.join('.hg').toString());
    }

    async status(repository: Repository, options?: Hg.Options.Status): Promise<HgFileChange[]> {
        const repo = await this.getHgRepo(repository);

        const args = ['status'];
        if (options) {
            if (options.range) {
                args.push('--rev', options.range.fromRevision, '--rev', options.range.toRevision);
            }
            if (options.uri) {
                args.push(FileUri.fsPath(options.uri));
            }
        }

        const outputChunks = await repo.runCommand(args);

        const changes: HgFileChange[] = [];
        let index = 0;
        while (index < outputChunks.length) {
            let status: HgFileStatus | undefined;
            const chunk = outputChunks[index++];
            if (chunk === 'M ') {
                status = HgFileStatus.Modified;
            } else if (chunk === '! ') {
                status = HgFileStatus.Deleted;
            } else if (chunk === 'A ') {
                status = HgFileStatus.New;
            } else if (chunk === '? ') {
                status = HgFileStatus.Untracked;
            } else if (chunk === 'R ') {
                status = HgFileStatus.Removed;
            } else if (chunk === 'C ') {
                status = HgFileStatus.Clean;
            } else if (chunk === 'I ') {
                status = HgFileStatus.Ignored;
            } else if (chunk === '  ') {
                // A line that does not begin with one of these letters means the line is showing
                // the origin of the previous file listed as A (added).
                // These lines only appear when the -C option is used in the status command.
                const previous = changes.pop();
                if (previous === undefined || previous.status !== HgFileStatus.New) {
                    throw new Error('Parse error');
                }
                const originChunk = outputChunks[index++];
                const updatedChange: HgFileChange = {
                    ...previous,
                    originOfAdd: originChunk,
                };
                changes.push(updatedChange);

                continue;
            }

            if (status === undefined) {
                throw new Error('Parse error');
            }

            const dataChunk = outputChunks[index++];

            const name = dataChunk.slice(0, dataChunk.length - 1); // remove trailing newline
            const uri = new URI(repository.localUri).resolve(name).toString();
            const change: HgFileChange = { uri, status, };
            changes.push(change);
        }

        return changes;
    }

    async add(repository: Repository, uris: string[]): Promise<void> {
        const paths = uris.map(uri => FileUri.fsPath(uri));
        await this.runCommand(repository, ['add', ...paths]);
    }

    protected async runCommand(repository: Repository, args: string | string[], responseProvider?: (promptKey: string) => Promise<string>): Promise<string[]> {
        const hgRepo = await this.getHgRepo(repository);
        return hgRepo.runCommand(args, responseProvider);

    }

    protected async getHgRepo(repository: Repository): Promise<HGRepo> {
        return getHgRepo(this.hgInit, repository.localUri);
    }

    async forget(repository: Repository, uris: string[]): Promise<void> {
        const paths = uris.map(uri => FileUri.fsPath(uri));
        await this.runCommand(repository, ['forget', ...paths]);
    }

    async branch(repository: Repository, options: { type: 'current' }): Promise<Branch | undefined>;
    async branch(repository: Repository, options: { type: 'local' | 'remote' | 'all' }): Promise<Branch[]>;
    async branch(repository: Repository, options: Hg.Options.BranchCommand.Create | Hg.Options.BranchCommand.Rename | Hg.Options.BranchCommand.Delete): Promise<void>;
    // tslint:disable-next-line:no-any
    async branch(repository: any, options: any): Promise<void | undefined | Branch | Branch[]> {
        const repo = await this.getHgRepo(repository);

        const output = await repo.runCommand(['branches']);

        const branches: Branch[] = [];
        let i = 0;
        do {
            const name = output[i++];
            const revisionId = output[i++].trim();
            i += 1;
            const author = {
                name: 'unknown',
                email: 'unknown',
                timestamp: 0
            } as CommitIdentity;
            const tip = {
                sha: revisionId,
                summary: 'Mercurial commit',
                author
            } as Commit;
            const branch = {
                name,
                type: BranchType.Local,
                tip,
                nameWithoutRemote: name
            } as Branch;
            branches.push(branch);
        } while (i < output.length);

        return branches;
    }

    async checkout(repository: Repository, options: Hg.Options.Checkout.CheckoutBranch | Hg.Options.Checkout.WorkingTreeFile): Promise<void> {
        const repo = await this.getHgRepo(repository);

        if (HgUtils.isBranchCheckout(options)) {
            await repo.runCommand(['checkout', options.branch]);
        } else {
            return Promise.reject(new Error('Mbed Studio does not provide support for checkout of a working tree of a Mercurial project.'));
        }
    }

    async commit(repository: Repository, message?: string, options?: Hg.Options.Commit): Promise<void> {
        let messageWithSignOff = message;
        if (options && options.signOff) {
            const nameAndEmail = (await this.exec(repository, ['config', 'ui.username']))
                .stdout.trim();

            const alreadySigned = messageWithSignOff && messageWithSignOff.endsWith(nameAndEmail);
            if (!alreadySigned) {
                const signOffText = `\n\nSigned-off-by: ${nameAndEmail}`;
                if (message) {
                    messageWithSignOff = message + signOffText;
                } else {
                    messageWithSignOff = signOffText;
                }
            }
        }
        const args = ['commit'];
        if (messageWithSignOff) {
            args.push('-m');
            args.push(messageWithSignOff);
        }
        if (options) {
            if (options.secret) {
                args.push('--secret');
            }
        }
        await this.runCommand(repository, args);
    }

    async push(repository: Repository, { remote, localBranch, remoteBranch, setUpstream, force }: Hg.Options.Push = {}): Promise<void> {
        // Get the remote name in case we need it for interactive prompts
        const remotes = await this.paths(repository, { name: (remote || 'default') });
        if (remotes.length !== 1) {
            throw new Error(`Expected one remote but got ${remotes.length}.`);
        }
        const remoteUrl = remotes[0].url;

        const args = ['push'];
        if (remote) {
            args.push(remote);  // 'dest' in Hg terminology
        }

        await this.runCommand(repository, args, promptKey => this.responseProvider(promptKey, remoteUrl));
    }

    protected async responseProvider(promptKey: string, remoteDescription: string): Promise<string> {
        const responses: { [s: string]: string; } = {
        };

        if (promptKey in responses) {
            return responses[promptKey];
        }
        const value = await this.prompt(remoteDescription, promptKey);
        return value;
    }

    protected async prompt(requestingHost: string, request: string): Promise<string> {
        try {
            const answer = await this.promptServer.ask({
                isPassword: /password/i.test(request),
                text: request,
                details: `Hg: ${requestingHost} (Press 'Enter' to confirm or 'Escape' to cancel.)`
            });
            if (HgPrompt.Success.is(answer) && typeof answer.result === 'string') {
                return answer.result;
            } else if (HgPrompt.Cancel.is(answer)) {
                return '';
            } else if (HgPrompt.Failure.is(answer)) {
                const { error } = answer;
                throw error;
            }
            throw new Error('Unexpected answer.'); // Do not ever log the `answer`, it might contain the password.
        } catch (e) {
            this.logger.error(`An unexpected error occurred when requesting ${request} by ${requestingHost}.`, e);
            return '';
        }
    }

    async pull(repository: Repository, options: Hg.Options.Pull = {}): Promise<void> {
        const args = ['pull'];
        if (options.branch) {
            args.push('-b', options.branch);
        }
        if (options.bookmarks) {
            for (const bookmark of options.bookmarks) {
                args.push('-B', bookmark);
            }
        }
        if (options.update) {
            args.push('--update');
        }
        if (options.rebase) {
            args.push('--rebase');
        }
        if (options.remote) {
            args.push(options.remote);  // 'source' in Hg terminology
        }
        await this.runCommand(repository, args);
    }

    /**
     * This is a synthetic command as there is no single hg command that is the equivalent of a Git reset.
     *
     */
    async reset(repository: Repository, options: Hg.Options.Reset): Promise<void> {
        // If the working tree is dirty then we commit the changes first.
        // This enables us to maintain the state of the working tree by reverting to this
        // new commit afterwards.
        const changes = await this.status(repository);
        const changesToCommit = changes.some(change => change.status !== HgFileStatus.Untracked);
        if (changesToCommit) {
            await this.commit(repository, 'working directory', { secret: true });
        }

        const currentCommit = await this.parent(repository);

        await this.update(repository, { revision: options.revision });
        await this.revert(repository, { revision: currentCommit });

        // Remove our temporary commit, now that we have restored the working directory to the
        // state that was saved in the commit.  Note that we cannot use 'uncommit' because Mercurial
        // seems to change the commit from 'secret' to 'public' when updating and reverting.
        if (changesToCommit) {
            await this.runCommand(repository, ['strip', currentCommit]);
        }
    }

    async merge(repository: Repository, revQuery: string): Promise<MergeResult> {
        const hgRepo = await this.getHgRepo(repository);
        const result = await hgRepo.runCommandReturningErrors(['merge', '-r', revQuery]);
        if (result.resultCode === 0) {
            return {
                unresolvedCount: 0
            };
        } else {
            // if (result.errorChunks.length !== 0 && result.errorChunks.join().match(/untracked files in working directory differ/)) {
            //     e.hgErrorCode = HgErrorCodes.UntrackedFilesDiffer;
            //     e.hgFilenames = this.parseUntrackedFilenames(e.stderr);
            // }

            if (result.resultCode === 1) {
                const match = result.outputChunks[0].match(/(\d+) files unresolved/);
                if (match) {
                    return {
                        unresolvedCount: parseInt(match[1])
                    };
                }
            }

            throw new Error(result.outputChunks.join() + ',' + result.errorChunks.join());
        }
    }

    async show(repository: Repository, uri: string, options?: Hg.Options.Show): Promise<string> {
        const repo = await this.getHgRepo(repository);

        const path = FileUri.fsPath(uri);
        const localPath = FileUri.fsPath(path);

        let revision = '.';
        if (options && options.commitish) {
            revision = options.commitish;
            if (revision === 'tip') {
                revision = '.';
            }
        }

        const output = await repo.runCommand(['cat', localPath, '-r', revision]);

        let content = '';
        let i = 0;
        do {
            content += output[i];
        } while (++i < output.length);

        return content;
    }

    async paths(repository: Repository, options?: Hg.Options.Paths): Promise<Remote[]> {
        const args = ['paths'];
        if (options && options.name) {
            args.push(options.name);
        }

        const outputChunks = await this.runCommand(repository, args);
        const results = [];
        if (options && options.name) {
            const remoteName = options.name;
            const url = outputChunks[0].trim();
            results.push({ remoteName, url });
        } else {
            const regex = /^(.*?)\s*=\s*$/;
            let i = 0;
            while (i < outputChunks.length) {
                const match = regex.exec(outputChunks[i]);
                if (!match) {
                    throw new Error('bad match');
                }
                const remoteName = match[1];
                const url = outputChunks[i + 1].trim();
                results.push({ remoteName, url });

                i += 2;
            }
        }
        return results;
    }

    async exec(repository: Repository, args: string[], options?: Hg.Options.Execution): Promise<HgResult> {
        const repo = await this.getHgRepo(repository);
        const outputChunks = await repo.runCommand(args);
        return <HgResult>{
            stdout: outputChunks.join('\n'),
            stderr: '',
            exitCode: 0
        };
    }

    private extractFiles(files: string): string[] {
        // TODO investigate what Mercurial gives us back if there is a space in the file name.
        // This code probably won't cope.
        return files === '' ? [] : files.split(' ');
    }

    async log(repository: Repository, options: Hg.Options.Log = {}): Promise<CommitWithChanges[]> {
        const repo = await this.getHgRepo(repository);

        let args: string[] = ['log', '--template', logTemplate];
        if (options.follow) {
            args.push('-f');
        }
        if (options.maxCount !== undefined) {
            args = args.concat(['--limit', options.maxCount.toString()]);
        }
        if (options.fullCommitMessages) {
            args = args.concat(['--verbose']);
        }
        if (options.revision) {
            args.push('-r', options.revision);
        }
        if (options.revQuery) {
            args.push('-r', options.revQuery);
        }

        const outputChunks = await repo.runCommand(args);

        return outputChunks.map(chunk => {
            /*
             * Note that 'desc' is not output in json format.  This is because the 'desc'
             * field may contain characters that would need to be escaped to make valid parsable
             * json, yet there is no way to get Mercurial to do this escaping, nor is there any easy
             * way for us to modify the text to do the escaping.  Therefore the template puts
             * the 'desc' field at the end with a separator that is not likely to appear in
             * the data.
             */
            const lines = chunk.split('end-json-start-desc');
            const commitLine = JSON.parse(lines[0]);

            const timestamp: number = commitLine.timestamp.split(' ')[0];

            const addedFiles = this.extractFiles(commitLine.added);
            const modifiedFiles = this.extractFiles(commitLine.modified);
            const deletedFiles = this.extractFiles(commitLine.deleted);

            const summary: string = lines[1];

            const fileChanges: HgFileChange[] = [];
            for (const filename of addedFiles) {
                fileChanges.push({ uri: `${repository.localUri}/${filename}`, status: HgFileStatus.New });
            }
            for (const filename of modifiedFiles) {
                fileChanges.push({ uri: `${repository.localUri}/${filename}`, status: HgFileStatus.Modified });
            }
            for (const filename of deletedFiles) {
                fileChanges.push({ uri: `${repository.localUri}/${filename}`, status: HgFileStatus.Deleted });
            }

            const sha = commitLine.node;
            const name = commitLine.author;
            const authorDateRelative = this.getAuthorDateRelative(timestamp);

            const author: CommitIdentity = { name, email: 'unknown', timestamp };
            return { sha, summary, author, authorDateRelative, fileChanges };
        });
    }

    async parent(repository: Repository): Promise<string> {
        const repo = await this.getHgRepo(repository);

        const args: string[] = ['parent', '--template', parentTemplate];
        const outputChunks = await repo.runCommand(args);
        if (outputChunks.length !== 1) {
            throw new Error(`Expected a single parent to the working tree, but got ${outputChunks.length}.`);
        }

        const commitLine = JSON.parse(outputChunks[0]);
        return commitLine.revision;
    }

    /**
     * This is implemented by Git and returned by Dugite.  For Mercurial, we need
     * to implement this ourselves.  This is close enough to providing the same as
     * the Git implementation.
     *
     * @param timestamp the timestamp of the Mercurial commit
     */
    private getAuthorDateRelative(timestamp: number): string {
        const now = new Date().getTime();
        const seconds = Math.round(now / 1000 - timestamp);
        if (seconds < 60) {
            return `${seconds} seconds ago`;
        }
        const minutes = Math.round(seconds / 60);
        if (minutes < 60) {
            return `${minutes} minutes ago`;
        }
        const hours = Math.round(minutes / 60);
        if (hours < 24) {
            return `${hours} hours ago`;
        }
        if (hours === 24) {
            return 'one day ago';
        }
        if (hours < 48) {
            return `one day, ${hours - 24} hours ago`;
        }
        const days = Math.round(hours / 24);
        if (days <= 8) {
            return `${days} days ago`;
        }
        if (days < 14) {
            return `one week, ${days - 7} days ago`;
        }
        const weeks = Math.round(days / 7);
        if (weeks < 8) {
            return `${weeks} weeks ago`;
        }
        const months = Math.round(days / 30.2);
        if (months < 12) {
            return `${months} months ago`;
        }
        if (months === 12) {
            return 'one year ago';
        }
        if (months === 13) {
            return 'one year, one month ago';
        }
        if (months < 24) {
            return `one year, ${months - 12} months ago`;
        }
        const years = Math.round(days / 365.25);
        return `${years} years ago`;
    }

    async lsFiles(repository: Repository, uri: string): Promise<boolean> {
        const repo = await this.getHgRepo(repository);
        const file = relative(FileUri.fsPath(repository.localUri), FileUri.fsPath(uri));
        const args = ['status', file];

        const outputChunks = await repo.runCommand(args);

        // If nothing comes back then the file is tracked and unmodified.
        if (outputChunks.length === 0) {
            return Promise.resolve(true);
        } else {
            const firstLine = outputChunks[0];
            return Promise.resolve(!firstLine.startsWith('?'));
        }
    }

    /**
     * https://www.selenic.com/mercurial/hg.1.html#revert
     */
    async revert(repository: Repository, options: Hg.Options.Revert): Promise<void> {
        const args = ['revert'];
        if (options.revision) {
            args.push('-r');
            args.push(options.revision);
        }
        if (options.uris === undefined) {
            args.push('--all');
        } else {
            for (const uri of options.uris) {
                const file = relative(FileUri.fsPath(repository.localUri), FileUri.fsPath(uri));
                args.push(file);
            }
        }
        await this.runCommand(repository, args);
    }

    /**
     * https://www.selenic.com/mercurial/hg.1.html#update
     */
    async update(repository: Repository, options?: Hg.Options.Update): Promise<void> {
        const args = ['update'];
        if (options) {
            if (options.clean) {
                args.push('--clean');
            }
            if (options.check) {
                args.push('--check');
            }
            if (options.revision) {
                args.push('-r');
                args.push(options.revision);
            }
        }

        await this.runCommand(repository, args);
    }

}

/**
 * This template outputs data in JSON format so the output from the log command is easily parsed.
 */
const logTemplate: string =
    '\\{ "node": "{node}",\\n' +
    '  "author": "{author}",\\n' +
    '  "timestamp": "{date|hgdate}",\\n' +
    '  "added": "{file_adds}",\\n' +
    '  "modified": "{file_mods}",\\n' +
    '  "deleted": "{file_dels}"\n}' +
    'end-json-start-desc{desc}';

/**
 * This template outputs data in JSON format so the output from the 'parent' command is easily parsed.
 */
const parentTemplate: string =
    '\\{ "node": "{node}",\\n' +
    '  "revision": "{rev}"\n}';
