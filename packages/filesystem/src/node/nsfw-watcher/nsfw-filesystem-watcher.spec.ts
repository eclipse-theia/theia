/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';

import * as tmp from 'tmp';

import * as fs from 'fs-extra';
import * as assert from 'assert';
import URI from "@theia/core/lib/common/uri";
import { FileUri } from "@theia/core/lib/node";
import { NsfwFileSystemWatcherServer } from './nsfw-filesystem-watcher';
import { DidFilesChangedParams } from '../../common/filesystem-watcher-protocol';
// tslint:disable:no-unused-expression

describe("nsfw-filesystem-watcher", () => {

    let root: URI;
    let watcherServer: NsfwFileSystemWatcherServer;
    let watcherId: number;

    beforeEach(async () => {
        const tmpDir = tmp.dirSync({ unsafeCleanup: true, prefix: 'node-fs-root-' });
        root = FileUri.create(fs.realpathSync(tmpDir.name));
        watcherServer = createNsfwFileSystemWatcherServer();
        watcherId = await watcherServer.watchFileChanges(root.toString());
    });

    afterEach(async () => {
        watcherServer.dispose();
    });

    describe("watch/unwatch file changes and notify clients", () => {
        test(
            "Should receive file changes events from in the workspace by default.",
            async () => {
                const actualUris = new Set<string>();

                const watcherClient = {
                    onDidFilesChanged(event: DidFilesChangedParams) {
                        event.changes.forEach(c => actualUris.add(c.uri.toString()));
                    }
                };
                watcherServer.setClient(watcherClient);

                const expectedUris = [
                    root.resolve("foo").toString(),
                    root.withPath(root.path.join('foo', 'bar')).toString(),
                    root.withPath(root.path.join('foo', 'bar', 'baz.txt')).toString()
                ];

                fs.mkdirSync(FileUri.fsPath(root.resolve("foo")));
                expect(fs.statSync(FileUri.fsPath(root.resolve("foo"))).isDirectory()).toEqual(true);
                await sleep(2000);

                fs.mkdirSync(FileUri.fsPath(root.resolve("foo").resolve("bar")));
                expect(fs.statSync(FileUri.fsPath(root.resolve("foo").resolve("bar"))).isDirectory()).toEqual(true);
                await sleep(2000);

                fs.writeFileSync(FileUri.fsPath(root.resolve("foo").resolve("bar").resolve("baz.txt")), "baz");
                expect(fs.readFileSync(FileUri.fsPath(root.resolve("foo").resolve("bar").resolve("baz.txt")), "utf8")).toEqual("baz");
                await sleep(2000);

                assert.deepEqual(expectedUris, [...actualUris]);
            },
            10000
        );

        test(
            "Should not receive file changes events from in the workspace by default if unwatched",
            async () => {
                const actualUris = new Set<string>();

                const watcherClient = {
                    onDidFilesChanged(event: DidFilesChangedParams) {
                        event.changes.forEach(c => actualUris.add(c.uri.toString()));
                    }
                };
                watcherServer.setClient(watcherClient);

                /* Unwatch root */
                watcherServer.unwatchFileChanges(watcherId);

                fs.mkdirSync(FileUri.fsPath(root.resolve("foo")));
                expect(fs.statSync(FileUri.fsPath(root.resolve("foo"))).isDirectory()).toEqual(true);
                await sleep(2000);

                fs.mkdirSync(FileUri.fsPath(root.resolve("foo").resolve("bar")));
                expect(fs.statSync(FileUri.fsPath(root.resolve("foo").resolve("bar"))).isDirectory()).toEqual(true);
                await sleep(2000);

                fs.writeFileSync(FileUri.fsPath(root.resolve("foo").resolve("bar").resolve("baz.txt")), "baz");
                expect(fs.readFileSync(FileUri.fsPath(root.resolve("foo").resolve("bar").resolve("baz.txt")), "utf8")).toEqual("baz");
                await sleep(2000);

                expect(actualUris.size).toEqual(0);
            },
            10000
        );
    });

    function createNsfwFileSystemWatcherServer() {
        return new NsfwFileSystemWatcherServer({
            verbose: true
        });
    }

    function sleep(time: number) {
        return new Promise(resolve => setTimeout(resolve, time));
    }

});

process.on("unhandledRejection", (reason: any) => {
    console.error("Unhandled promise rejection: " + reason);
});
