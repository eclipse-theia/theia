/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { GitDiffModel, GitLogOptions, CommitFragment } from './git-diff-model';
import { injectable, inject } from "inversify";
import { GitRepositoryProvider } from '../git-repository-provider';
import { Git, Repository, GitFileChange, GitUtils } from '../../common';
import { FileUri } from '@theia/core/lib/node/file-uri';
import * as Path from 'path';

@injectable()
export class GitDiffService {

    constructor(
        @inject(GitDiffModel) protected readonly model: GitDiffModel,
        @inject(Git) protected readonly git: Git,
        @inject(GitRepositoryProvider) protected readonly repositoryProvider: GitRepositoryProvider
    ) { }

    async setData(options: GitLogOptions) {
        const repository = this.repositoryProvider.selectedRepository;

        if (repository) {
            const commitFragments = await this.log(repository, options);
            const diff = await this.getDiff(repository, options);
            this.model.updateModel(commitFragments, diff, options);
        }
    }

    async getDiff(repository: Repository, options: GitLogOptions): Promise<GitFileChange[]> {
        const range = this.getRangeArg(options);
        const args = ['diff', '--name-status', range];
        if (options.fileUri) {
            args.push(...['--', GitUtils.getRepositoryRelativePath(repository, options.fileUri)]);
        }
        const changes: GitFileChange[] = [];
        (await this.git.exec(repository, args)).stdout.split('\0').map(line => line.match(/\S+/g) || []).forEach(fragments => {
            for (let i = 0; i < fragments.length; i = i + 2) {
                const status = GitUtils.mapStatus(fragments[i]);
                const uri = this.toUri(repository, fragments[i + 1]);
                changes.push({
                    uri,
                    status
                });
            }
        });
        return changes;
    }

    toUri(repository: Repository, pathSegment: undefined): undefined;
    toUri(repository: Repository, pathSegment: string): string;
    toUri(repository: Repository, pathSegment: string | undefined): string | undefined {
        if (pathSegment === undefined) {
            return undefined;
        }
        return FileUri.create(Path.join(FileUri.fsPath(repository.localUri), pathSegment)).toString();
    }

    getRangeArg(options?: GitLogOptions): string {
        let range = 'HEAD';
        if (options) {
            if (options.toRevision) {
                range = options.toRevision;
            }
            if (typeof options.fromRevision === 'number') {
                range = `${range}~${options.fromRevision}..${range}`;
            } else if (typeof options.fromRevision === 'string') {
                range = `${options.fromRevision}~1..${range}`;
            }
        }
        return range;
    }

    async log(repository: Repository, options?: GitLogOptions): Promise<CommitFragment[]> {
        const commits: CommitFragment[] = [];
        // If remaining commits should be calculated by the backend, then run `git rev-list --count ${fromRevision | HEAD~fromRevision}`.
        // How to use `mailmap` to map authors: https://www.kernel.org/pub/software/scm/git/docs/git-shortlog.html.
        // (Probably, this would the responsibility of the `GitHub` extension.)
        const args = [
            'log'
        ];
        if (options && options.branch) {
            args.push(options.branch);
        }
        const range = this.getRangeArg(options);
        args.push(...[range, '-C', '-M', '-m']);
        const maxCount = options && options.maxCount ? options.maxCount : 0;
        if (Number.isInteger(maxCount) && maxCount > 0) {
            args.push(...['-n', `${maxCount}`]);
        }
        args.push(...['--name-status', '--date=unix', `--format=%n%n%H%n%aE%n%aN%n%ad%n%ar%n%s`, '-z', '--']);
        if (options && options.fileUri) {
            const file = GitUtils.getRepositoryRelativePath(repository, options.fileUri);
            args.push(...[file]);
        }
        const blocks = (await this.git.exec(repository, args)).stdout.split('\n\n').slice(1);
        blocks.map(block => block.split('\n')).forEach(lines => {
            const commitSha = lines.shift() || '';
            const authorEmail = lines.shift() || '';
            const authorName = lines.shift() || '';
            const authorDate = this.toDate(lines.shift());
            const authorDateRelative = lines.shift() || '';
            const commitMessage = this.toCommitMessage(lines.shift());
            const fileChanges: GitFileChange[] = [];
            const rawFileChanges = (lines.shift() || '').split('\0').map(line => line.trim()).filter(line => line.length > 0);
            for (let i = 0; i < rawFileChanges.length; i = i + 2) {
                const status = GitUtils.mapStatus(rawFileChanges[i]);
                const uri = this.toUri(repository, rawFileChanges[i + 1]);
                if (uri) {
                    fileChanges.push({
                        uri,
                        status
                    });
                }
            }
            commits.push({
                commitSha,
                authorEmail,
                authorName,
                authorDate,
                authorDateRelative,
                commitMessage,
                fileChanges
            });
        });
        return commits;
    }

    toCommitMessage(raw: string | undefined): string {
        return (raw || '').split('\0').shift() || '';
    }

    toDate(epochSeconds: string | undefined): Date {
        const date = new Date(0);
        if (epochSeconds) {
            date.setUTCSeconds(Number.parseInt(epochSeconds));
        }
        return date;
    }
}
