/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { CommonAppGenerator, generatorTheiaPath, ProjectModel } from 'generator-theia';
import { MaybePromise, Disposable, DisposableCollection, Event, Emitter } from "@theia/core";
import { FileUri } from "@theia/core/lib/node";
import { FileSystem } from "@theia/filesystem/lib/common";
import { FileSystemWatcherServer, DidFilesChangedParams } from "@theia/filesystem/lib/common/filesystem-watcher-protocol";

export const AppProjectPath = Symbol('AppProjectPath');

@injectable()
export class AppProject implements Disposable {

    protected readonly packageUri: Promise<string>;
    protected readonly toDispose = new DisposableCollection();
    protected readonly onChangedEmitter = new Emitter<void>();

    constructor(
        @inject(AppProjectPath) protected readonly path: string,
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileSystemWatcherServer) protected readonly fileSystemWatcher: FileSystemWatcherServer
    ) {
        this.packageUri = this.load().then(model =>
            FileUri.create(model.pckPath).toString()
        );
        this.toDispose.push(this.fileSystemWatcher);
        this.fileSystemWatcher.setClient({
            onDidFilesChanged: changes => this.onDidFilesChanged(changes)
        });
        this.packageUri.then(async uri => {
            const watcher = await this.fileSystemWatcher.watchFileChanges(uri);
            this.toDispose.push(Disposable.create(() => this.fileSystemWatcher.unwatchFileChanges(watcher)));
        });
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    get onDidChangePackage(): Event<void> {
        return this.onChangedEmitter.event;
    }
    protected fireDidChangePackage(): void {
        this.onChangedEmitter.fire(undefined);
    }
    protected isPackageChanged(param: DidFilesChangedParams): Promise<boolean> {
        return this.packageUri.then(uri =>
            param.changes.some(change => change.uri === uri)
        );
    }
    protected onDidFilesChanged(param: DidFilesChangedParams): void {
        this.isPackageChanged(param).then(changed => {
            if (changed) {
                this.fireDidChangePackage();
            }
        });
    }

    load(): Promise<ProjectModel> {
        const generator = new CommonAppGenerator([], {
            env: {
                cwd: this.path
            },
            resolved: generatorTheiaPath
        });
        generator.initializing();
        return generator.configuring().then(() => generator.model);
    }

    async save(model: MaybePromise<ProjectModel>): Promise<void> {
        const resolved = await model;
        const stat = await this.fileSystem.getFileStat(FileUri.create(resolved.pckPath).toString());
        await this.fileSystem.setContent(stat, JSON.stringify(resolved.pck, undefined, 2));
    }

    async update(run: (model: ProjectModel) => MaybePromise<boolean>): Promise<void> {
        const model = await this.load();
        if (await run(model)) {
            await this.save(model);
        }
    }

}
