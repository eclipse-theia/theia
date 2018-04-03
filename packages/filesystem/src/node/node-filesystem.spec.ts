/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';

import * as os from 'os';
import * as tmp from 'tmp';

import * as fs from 'fs-extra';
import URI from "@theia/core/lib/common/uri";
import { FileUri } from "@theia/core/lib/node";
import { FileSystem } from "../common/filesystem";
import { FileSystemNode } from "./node-filesystem";

// tslint:disable:no-unused-expression

describe("NodeFileSystem", () => {

    let root: URI;
    let fileSystem: FileSystem;

    beforeEach(async () => {
        const tmpDir = tmp.dirSync({ unsafeCleanup: true, prefix: 'node-fs-root-' });
        root = FileUri.create(fs.realpathSync(tmpDir.name));
        fileSystem = createFileSystem();
    });

    describe("01 #getFileStat", () => {

        test("Should be rejected if not file exists under the given URI.", async () => {
            const uri = root.resolve("foo.txt");
            expect(fs.existsSync(FileUri.fsPath(uri))).toEqual(false);

            await expect(fileSystem.getFileStat(uri.toString())).rejects.toBeDefined();
        });

        test("Should return a proper result for a file.", async () => {
            const uri = root.resolve("foo.txt");
            fs.writeFileSync(FileUri.fsPath(uri), "foo");
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).toEqual(true);

            const stat = await fileSystem.getFileStat(uri.toString());
            expect(stat.isDirectory).toEqual(false);
            expect(stat.uri).toEqual(uri.toString());
        });

        test("Should return a proper result for a directory.", async () => {
            const uri_1 = root.resolve("foo.txt");
            const uri_2 = root.resolve("bar.txt");
            fs.writeFileSync(FileUri.fsPath(uri_1), "foo");
            fs.writeFileSync(FileUri.fsPath(uri_2), "bar");
            expect(fs.statSync(FileUri.fsPath(uri_1)).isFile()).toEqual(true);
            expect(fs.statSync(FileUri.fsPath(uri_2)).isFile()).toEqual(true);

            const stat = await fileSystem.getFileStat(root.toString());
            expect(stat.children!).toHaveLength(2);
        });

    });

    describe("02 #resolveContent", () => {

        test(
            "Should be rejected with an error when trying to resolve the content of a non-existing file.",
            async () => {
                const uri = root.resolve("foo.txt");
                expect(fs.existsSync(FileUri.fsPath(uri))).toEqual(false);

                await expect(fileSystem.resolveContent(uri.toString())).rejects.toBeDefined();
            }
        );

        test(
            "Should be rejected with an error when trying to resolve the content of a directory.",
            async () => {
                const uri = root.resolve("foo");
                fs.mkdirSync(FileUri.fsPath(uri));
                expect(fs.existsSync(FileUri.fsPath(uri))).toEqual(true);
                expect(fs.statSync(FileUri.fsPath(uri)).isDirectory()).toEqual(true);

                await expect(fileSystem.resolveContent(uri.toString())).rejects.toBeDefined();
            }
        );

        test(
            "Should be rejected with an error if the desired encoding cannot be handled.",
            async () => {
                const uri = root.resolve("foo.txt");
                fs.writeFileSync(FileUri.fsPath(uri), "foo", { encoding: "utf8" });
                expect(fs.existsSync(FileUri.fsPath(uri))).toEqual(true);
                expect(fs.statSync(FileUri.fsPath(uri)).isFile()).toEqual(true);
                expect(fs.readFileSync(FileUri.fsPath(uri), { encoding: "utf8" })).toEqual("foo");

                await expect(fileSystem.resolveContent(uri.toString(), { encoding: "unknownEncoding" })).rejects.toBeDefined();
            }
        );

        test("Should be return with the content for an existing file.", async () => {
            const uri = root.resolve("foo.txt");
            fs.writeFileSync(FileUri.fsPath(uri), "foo", { encoding: "utf8" });
            expect(fs.existsSync(FileUri.fsPath(uri))).toEqual(true);
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).toEqual(true);
            expect(fs.readFileSync(FileUri.fsPath(uri), { encoding: "utf8" })).toEqual("foo");

            await expect(fileSystem.resolveContent(uri.toString())).resolves.toHaveProperty("content", "foo");
        });

        test("Should be return with the stat object for an existing file.", async () => {
            const uri = root.resolve("foo.txt");
            fs.writeFileSync(FileUri.fsPath(uri), "foo", { encoding: "utf8" });
            expect(fs.existsSync(FileUri.fsPath(uri))).toEqual(true);
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).toEqual(true);
            expect(fs.readFileSync(FileUri.fsPath(uri), { encoding: "utf8" })).toEqual("foo");

            const content = await fileSystem.resolveContent(uri.toString());
            expect(content).toHaveProperty("stat");
            expect(content.stat.uri).toEqual(uri.toString());
            expect(content.stat.size).toBeGreaterThan(1);
            expect(content.stat.lastModification).toBeGreaterThan(1);
            expect(content.stat.isDirectory).toBeFalsy();
            expect(content.stat).not.toHaveProperty("children");
        });

    });

    describe("03 #setContent", () => {

        test(
            "Should be rejected with an error when trying to set the content of a non-existing file.",
            async () => {
                const uri = root.resolve("foo.txt");
                expect(fs.existsSync(FileUri.fsPath(uri))).toEqual(false);

                const stat = {
                    uri: uri.toString(),
                    lastModification: new Date().getTime(),
                    isDirectory: false
                };
                await expect(fileSystem.setContent(stat, "foo")).rejects.toBeDefined();
            }
        );

        test(
            "Should be rejected with an error when trying to set the content of a directory.",
            async () => {
                const uri = root.resolve("foo");
                fs.mkdirSync(FileUri.fsPath(uri));
                expect(fs.existsSync(FileUri.fsPath(uri))).toEqual(true);
                expect(fs.statSync(FileUri.fsPath(uri)).isDirectory()).toEqual(true);

                const stat = await fileSystem.getFileStat(uri.toString());
                await expect(fileSystem.setContent(stat, "foo")).rejects.toBeDefined();
            }
        );

        test(
            "Should be rejected with an error when trying to set the content of a file which is out-of-sync.",
            async () => {
                const uri = root.resolve("foo.txt");
                fs.writeFileSync(FileUri.fsPath(uri), "foo", { encoding: "utf8" });
                expect(fs.existsSync(FileUri.fsPath(uri))).toEqual(true);
                expect(fs.statSync(FileUri.fsPath(uri)).isFile()).toEqual(true);
                expect(fs.readFileSync(FileUri.fsPath(uri), { encoding: "utf8" })).toEqual("foo");

                const stat = await fileSystem.getFileStat(uri.toString());
                // Make sure current file stat is out-of-sync.
                // Here the content is modified in the way that file sizes will differ.
                fs.writeFileSync(FileUri.fsPath(uri), "longer", { encoding: "utf8" });
                expect(fs.readFileSync(FileUri.fsPath(uri), { encoding: "utf8" })).toEqual("longer");

                await expect(fileSystem.setContent(stat, "baz")).rejects.toBeDefined();
            }
        );

        test(
            "Should be rejected with an error when trying to set the content when the desired encoding cannot be handled.",
            async () => {
                const uri = root.resolve("foo.txt");
                fs.writeFileSync(FileUri.fsPath(uri), "foo", { encoding: "utf8" });
                expect(fs.existsSync(FileUri.fsPath(uri))).toEqual(true);
                expect(fs.statSync(FileUri.fsPath(uri)).isFile()).toEqual(true);
                expect(fs.readFileSync(FileUri.fsPath(uri), { encoding: "utf8" })).toEqual("foo");

                const stat = await fileSystem.getFileStat(uri.toString());
                await expect(fileSystem.setContent(stat, "baz", { encoding: "unknownEncoding" })).rejects.toBeDefined();
            }
        );

        test(
            "Should return with a stat representing the latest state of the successfully modified file.",
            async () => {
                const uri = root.resolve("foo.txt");
                fs.writeFileSync(FileUri.fsPath(uri), "foo", { encoding: "utf8" });
                expect(fs.existsSync(FileUri.fsPath(uri))).toEqual(true);
                expect(fs.statSync(FileUri.fsPath(uri)).isFile()).toEqual(true);
                expect(fs.readFileSync(FileUri.fsPath(uri), { encoding: "utf8" })).toEqual("foo");

                const currentStat = await fileSystem.getFileStat(uri.toString());
                await fileSystem.setContent(currentStat, "baz");
                await expect(fs.readFileSync(FileUri.fsPath(uri), { encoding: "utf8" })).toEqual("baz");
            }
        );

    });

    describe("04 #move", () => {

        test(
            "Should be rejected with an error if no file exists under the source location.",
            async () => {
                const sourceUri = root.resolve("foo.txt");
                const targetUri = root.resolve("bar.txt");
                expect(fs.existsSync(FileUri.fsPath(sourceUri))).toEqual(false);

                await expect(fileSystem.move(sourceUri.toString(), targetUri.toString())).rejects.toBeDefined();
            }
        );

        test(
            "Should be rejected with an error if target exists and overwrite is not set to \'true\'.",
            async () => {
                const sourceUri = root.resolve("foo.txt");
                const targetUri = root.resolve("bar.txt");
                fs.writeFileSync(FileUri.fsPath(sourceUri), "foo");
                fs.writeFileSync(FileUri.fsPath(targetUri), "bar");
                expect(fs.statSync(FileUri.fsPath(sourceUri)).isFile()).toEqual(true);
                expect(fs.statSync(FileUri.fsPath(targetUri)).isFile()).toEqual(true);

                await expect(fileSystem.move(sourceUri.toString(), targetUri.toString())).rejects.toBeDefined();
            }
        );

        test(
            "Moving a file to an empty directory. Should be rejected with an error because files cannot be moved to an existing directory locations.",
            async () => {
                const sourceUri = root.resolve("foo.txt");
                const targetUri = root.resolve("bar");
                fs.writeFileSync(FileUri.fsPath(sourceUri), "foo");
                fs.mkdirSync(FileUri.fsPath(targetUri));
                expect(fs.statSync(FileUri.fsPath(sourceUri)).isFile()).toEqual(true);
                expect(fs.readFileSync(FileUri.fsPath(sourceUri), "utf8")).toEqual("foo");
                expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).toEqual(true);
                expect(fs.readdirSync(FileUri.fsPath(targetUri))).toHaveLength(0);

                await expect(fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true })).rejects.toBeDefined();
            }
        );

        test(
            "Moving a file to a non-empty directory. Should be rejected with and error because files cannot be moved to an existing directory locations.",
            async () => {
                const sourceUri = root.resolve("foo.txt");
                const targetUri = root.resolve("bar");
                const targetFileUri_01 = targetUri.resolve("bar_01.txt");
                const targetFileUri_02 = targetUri.resolve("bar_02.txt");
                fs.writeFileSync(FileUri.fsPath(sourceUri), "foo");
                fs.mkdirSync(FileUri.fsPath(targetUri));
                fs.writeFileSync(FileUri.fsPath(targetFileUri_01), "bar_01");
                fs.writeFileSync(FileUri.fsPath(targetFileUri_02), "bar_02");
                expect(fs.statSync(FileUri.fsPath(sourceUri)).isFile()).toEqual(true);
                expect(fs.readFileSync(FileUri.fsPath(sourceUri), "utf8")).toEqual("foo");
                expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).toEqual(true);
                expect(fs.readFileSync(FileUri.fsPath(targetFileUri_01), "utf8")).toEqual("bar_01");
                expect(fs.readFileSync(FileUri.fsPath(targetFileUri_02), "utf8")).toEqual("bar_02");
                const paths = fs.readdirSync(FileUri.fsPath(targetUri));
                expect(paths).toContain("bar_01.txt");
                expect(paths).toContain("bar_02.txt");

                await expect(fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true })).rejects.toBeDefined();
            }
        );

        test(
            "Moving an empty directory to file. Should be rejected with an error because directories and cannot be moved to existing file locations.",
            async () => {
                const sourceUri = root.resolve("foo");
                const targetUri = root.resolve("bar.txt");
                fs.mkdirSync(FileUri.fsPath(sourceUri));
                fs.writeFileSync(FileUri.fsPath(targetUri), "bar");
                expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).toEqual(true);
                expect(fs.statSync(FileUri.fsPath(targetUri)).isFile()).toEqual(true);
                expect(fs.readFileSync(FileUri.fsPath(targetUri), "utf8")).toEqual("bar");
                expect(fs.readdirSync(FileUri.fsPath(sourceUri))).toHaveLength(0);

                await expect(fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true })).rejects.toBeDefined();
            }
        );

        test(
            "Moving a non-empty directory to file. Should be rejected with an error because directories cannot be moved to existing file locations.",
            async () => {
                const sourceUri = root.resolve("foo");
                const targetUri = root.resolve("bar.txt");
                const sourceFileUri_01 = sourceUri.resolve("foo_01.txt");
                const sourceFileUri_02 = sourceUri.resolve("foo_02.txt");
                fs.mkdirSync(FileUri.fsPath(sourceUri));
                fs.writeFileSync(FileUri.fsPath(targetUri), "bar");
                fs.writeFileSync(FileUri.fsPath(sourceFileUri_01), "foo_01");
                fs.writeFileSync(FileUri.fsPath(sourceFileUri_02), "foo_02");
                expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).toEqual(true);
                expect(fs.statSync(FileUri.fsPath(targetUri)).isFile()).toEqual(true);
                expect(fs.readFileSync(FileUri.fsPath(targetUri), "utf8")).toEqual("bar");
                const paths = fs.readdirSync(FileUri.fsPath(sourceUri));
                expect(paths).toContain("foo_01.txt");
                expect(paths).toContain("foo_02.txt");

                await expect(fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true })).rejects.toBeDefined();
            }
        );

        test(
            "Moving file to file. Should overwrite the target file content and delete the source file.",
            () => {
                const sourceUri = root.resolve("foo.txt");
                const targetUri = root.resolve("bar.txt");
                fs.writeFileSync(FileUri.fsPath(sourceUri), "foo");
                expect(fs.statSync(FileUri.fsPath(sourceUri)).isFile()).toEqual(true);
                expect(fs.existsSync(FileUri.fsPath(targetUri))).toEqual(false);

                return fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true }).then(stat => {
                    expect(stat).toHaveProperty("uri", targetUri.toString());
                    expect(fs.existsSync(FileUri.fsPath(sourceUri))).toEqual(false);
                    expect(fs.statSync(FileUri.fsPath(targetUri)).isFile()).toEqual(true);
                    expect(fs.readFileSync(FileUri.fsPath(targetUri), "utf8")).toEqual("foo");
                });
            }
        );

        test(
            "Moving an empty directory to an empty directory. Should remove the source directory.",
            () => {
                const sourceUri = root.resolve("foo");
                const targetUri = root.resolve("bar");
                fs.mkdirSync(FileUri.fsPath(sourceUri));
                fs.mkdirSync(FileUri.fsPath(targetUri));
                expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).toEqual(true);
                expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).toEqual(true);
                expect(fs.readdirSync(FileUri.fsPath(sourceUri))).toHaveLength(0);
                expect(fs.readdirSync(FileUri.fsPath(targetUri))).toHaveLength(0);

                return fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true }).then(stat => {
                    expect(stat).toHaveProperty("uri", targetUri.toString());
                    expect(fs.existsSync(FileUri.fsPath(sourceUri))).toEqual(false);
                    expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).toEqual(true);
                    expect(fs.readdirSync(FileUri.fsPath(targetUri))).toHaveLength(0);
                });
            }
        );

        test(
            "Moving an empty directory to a non-empty directory. Should be rejected because the target folder is not empty.",
            async () => {
                const sourceUri = root.resolve("foo");
                const targetUri = root.resolve("bar");
                const targetFileUri_01 = targetUri.resolve("bar_01.txt");
                const targetFileUri_02 = targetUri.resolve("bar_02.txt");
                fs.mkdirSync(FileUri.fsPath(sourceUri));
                fs.mkdirSync(FileUri.fsPath(targetUri));
                fs.writeFileSync(FileUri.fsPath(targetFileUri_01), "bar_01");
                fs.writeFileSync(FileUri.fsPath(targetFileUri_02), "bar_02");
                expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).toEqual(true);
                expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).toEqual(true);
                expect(fs.readdirSync(FileUri.fsPath(sourceUri))).toHaveLength(0);
                expect(fs.readFileSync(FileUri.fsPath(targetFileUri_01), "utf8")).toEqual("bar_01");
                expect(fs.readFileSync(FileUri.fsPath(targetFileUri_02), "utf8")).toEqual("bar_02");
                const paths = fs.readdirSync(FileUri.fsPath(targetUri));
                expect(paths).toContain("bar_01.txt");
                expect(paths).toContain("bar_02.txt");

                await expect(fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true })).rejects.toBeDefined();
            }
        );

        test(
            "Moving a non-empty directory to an empty directory. Source folder and its content should be moved to the target location.",
            () => {
                const sourceUri = root.resolve("foo");
                const targetUri = root.resolve("bar");
                const sourceFileUri_01 = sourceUri.resolve("foo_01.txt");
                const sourceFileUri_02 = sourceUri.resolve("foo_02.txt");
                fs.mkdirSync(FileUri.fsPath(sourceUri));
                fs.mkdirSync(FileUri.fsPath(targetUri));
                fs.writeFileSync(FileUri.fsPath(sourceFileUri_01), "foo_01");
                fs.writeFileSync(FileUri.fsPath(sourceFileUri_02), "foo_02");
                expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).toEqual(true);
                expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).toEqual(true);
                expect(fs.readdirSync(FileUri.fsPath(targetUri))).toHaveLength(0);
                const paths = fs.readdirSync(FileUri.fsPath(sourceUri));
                expect(paths).toContain("foo_01.txt");
                expect(paths).toContain("foo_02.txt");
                expect(fs.readFileSync(FileUri.fsPath(sourceFileUri_01), "utf8")).toEqual("foo_01");
                expect(fs.readFileSync(FileUri.fsPath(sourceFileUri_02), "utf8")).toEqual("foo_02");

                return fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true }).then(stat => {
                    expect(stat).toHaveProperty("uri", targetUri.toString());
                    expect(fs.existsSync(FileUri.fsPath(sourceUri))).toEqual(false);
                    expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).toEqual(true);
                    const paths = fs.readdirSync(FileUri.fsPath(targetUri));
                    expect(paths).toContain("foo_01.txt");
                    expect(paths).toContain("foo_02.txt");
                    expect(fs.readFileSync(FileUri.fsPath(targetUri.resolve("foo_01.txt")), "utf8")).toEqual("foo_01");
                    expect(fs.readFileSync(FileUri.fsPath(targetUri.resolve("foo_02.txt")), "utf8")).toEqual("foo_02");
                });
            }
        );

        test(
            "Moving a non-empty directory to a non-empty directory. Should be rejected because the target location is not empty.",
            async () => {
                const sourceUri = root.resolve("foo");
                const targetUri = root.resolve("bar");
                const sourceFileUri_01 = sourceUri.resolve("foo_01.txt");
                const sourceFileUri_02 = sourceUri.resolve("foo_02.txt");
                const targetFileUri_01 = targetUri.resolve("bar_01.txt");
                const targetFileUri_02 = targetUri.resolve("bar_02.txt");
                fs.mkdirSync(FileUri.fsPath(sourceUri));
                fs.mkdirSync(FileUri.fsPath(targetUri));
                fs.writeFileSync(FileUri.fsPath(sourceFileUri_01), "foo_01");
                fs.writeFileSync(FileUri.fsPath(sourceFileUri_02), "foo_02");
                fs.writeFileSync(FileUri.fsPath(targetFileUri_01), "bar_01");
                fs.writeFileSync(FileUri.fsPath(targetFileUri_02), "bar_02");
                expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).toEqual(true);
                expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).toEqual(true);
                expect(fs.readFileSync(FileUri.fsPath(sourceFileUri_01), "utf8")).toEqual("foo_01");
                expect(fs.readFileSync(FileUri.fsPath(sourceFileUri_02), "utf8")).toEqual("foo_02");
                expect(fs.readFileSync(FileUri.fsPath(targetFileUri_01), "utf8")).toEqual("bar_01");
                expect(fs.readFileSync(FileUri.fsPath(targetFileUri_02), "utf8")).toEqual("bar_02");
                const sourcePaths = fs.readdirSync(FileUri.fsPath(sourceUri));
                expect(sourcePaths).toContain("foo_01.txt");
                expect(sourcePaths).toContain("foo_02.txt");
                const targetPaths = fs.readdirSync(FileUri.fsPath(targetUri));
                expect(targetPaths).toContain("bar_01.txt");
                expect(targetPaths).toContain("bar_02.txt");

                await expect(fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true })).rejects.toBeDefined();
            }
        );

    });

    describe("05 #copy", () => {

        test(
            "Copy a file from non existing location. Should be rejected with an error. Nothing to copy.",
            async () => {
                const sourceUri = root.resolve("foo");
                const targetUri = root.resolve("bar");
                fs.mkdirSync(FileUri.fsPath(targetUri));
                expect(fs.existsSync(FileUri.fsPath(sourceUri))).toEqual(false);
                expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).toEqual(true);

                await expect(fileSystem.copy(sourceUri.toString(), targetUri.toString())).rejects.toBeDefined();
            }
        );

        test(
            "Copy a file to existing location without overwrite enabled. Should be rejected with an error.",
            async () => {
                const sourceUri = root.resolve("foo");
                const targetUri = root.resolve("bar");
                fs.mkdirSync(FileUri.fsPath(targetUri));
                fs.mkdirSync(FileUri.fsPath(sourceUri));
                expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).toEqual(true);
                expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).toEqual(true);

                await expect(fileSystem.copy(sourceUri.toString(), targetUri.toString())).rejects.toBeDefined();
            }
        );

        test(
            "Copy an empty directory to a non-existing location. Should return with the file stat representing the new file at the target location.",
            () => {
                const sourceUri = root.resolve("foo");
                const targetUri = root.resolve("bar");
                fs.mkdirSync(FileUri.fsPath(sourceUri));
                expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).toEqual(true);
                expect(fs.existsSync(FileUri.fsPath(targetUri))).toEqual(false);

                return fileSystem.copy(sourceUri.toString(), targetUri.toString()).then(stat => {
                    expect(stat).toHaveProperty("uri", targetUri.toString());
                    expect(fs.existsSync(FileUri.fsPath(sourceUri))).toEqual(true);
                    expect(fs.existsSync(FileUri.fsPath(targetUri))).toEqual(true);
                });
            }
        );

        test(
            "Copy an empty directory to a non-existing, nested location. Should return with the file stat representing the new file at the target location.",
            () => {
                const sourceUri = root.resolve("foo");
                const targetUri = root.resolve("nested/path/to/bar");
                fs.mkdirSync(FileUri.fsPath(sourceUri));
                expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).toEqual(true);
                expect(fs.existsSync(FileUri.fsPath(targetUri))).toEqual(false);

                return fileSystem.copy(sourceUri.toString(), targetUri.toString()).then(stat => {
                    expect(stat).toHaveProperty("uri", targetUri.toString());
                    expect(fs.existsSync(FileUri.fsPath(sourceUri))).toEqual(true);
                    expect(fs.existsSync(FileUri.fsPath(targetUri))).toEqual(true);
                });
            }
        );

        test(
            "Copy a directory with content to a non-existing location. Should return with the file stat representing the new file at the target location.",
            () => {
                const sourceUri = root.resolve("foo");
                const targetUri = root.resolve("bar");
                const subSourceUri = sourceUri.resolve("foo_01.txt");
                fs.mkdirSync(FileUri.fsPath(sourceUri));
                fs.writeFileSync(FileUri.fsPath(subSourceUri), "foo");
                expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).toEqual(true);
                expect(fs.statSync(FileUri.fsPath(subSourceUri)).isFile()).toEqual(true);
                expect(fs.readFileSync(FileUri.fsPath(subSourceUri), "utf8")).toEqual("foo");
                expect(fs.existsSync(FileUri.fsPath(targetUri))).toEqual(false);

                return fileSystem.copy(sourceUri.toString(), targetUri.toString()).then(stat => {
                    expect(stat).toHaveProperty("uri", targetUri.toString());
                    expect(fs.existsSync(FileUri.fsPath(sourceUri))).toEqual(true);
                    expect(fs.existsSync(FileUri.fsPath(targetUri))).toEqual(true);
                    expect(fs.readdirSync(FileUri.fsPath(sourceUri))).toContain("foo_01.txt");
                    expect(fs.readdirSync(FileUri.fsPath(targetUri))).toContain("foo_01.txt");
                    expect(fs.readFileSync(FileUri.fsPath(subSourceUri), "utf8")).toEqual("foo");
                    expect(fs.readFileSync(FileUri.fsPath(targetUri.resolve("foo_01.txt")), "utf8")).toEqual("foo");
                });
            }
        );

        test(
            "Copy a directory with content to a non-existing, nested location. Should return with the file stat representing the new file at the target location.",
            () => {
                const sourceUri = root.resolve("foo");
                const targetUri = root.resolve("nested/path/to/bar");
                const subSourceUri = sourceUri.resolve("foo_01.txt");
                fs.mkdirSync(FileUri.fsPath(sourceUri));
                fs.writeFileSync(FileUri.fsPath(subSourceUri), "foo");
                expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).toEqual(true);
                expect(fs.statSync(FileUri.fsPath(subSourceUri)).isFile()).toEqual(true);
                expect(fs.readFileSync(FileUri.fsPath(subSourceUri), "utf8")).toEqual("foo");
                expect(fs.existsSync(FileUri.fsPath(targetUri))).toEqual(false);

                return fileSystem.copy(sourceUri.toString(), targetUri.toString()).then(stat => {
                    expect(stat).toHaveProperty("uri", targetUri.toString());
                    expect(fs.existsSync(FileUri.fsPath(sourceUri))).toEqual(true);
                    expect(fs.existsSync(FileUri.fsPath(targetUri))).toEqual(true);
                    expect(fs.readdirSync(FileUri.fsPath(sourceUri))).toContain("foo_01.txt");
                    expect(fs.readdirSync(FileUri.fsPath(targetUri))).toContain("foo_01.txt");
                    expect(fs.readFileSync(FileUri.fsPath(subSourceUri), "utf8")).toEqual("foo");
                    expect(fs.readFileSync(FileUri.fsPath(targetUri.resolve("foo_01.txt")), "utf8")).toEqual("foo");
                });
            }
        );

    });

    describe("07 #createFile", () => {

        test(
            "Should be rejected with an error if a file already exists with the given URI.",
            async () => {
                const uri = root.resolve("foo.txt");
                fs.writeFileSync(FileUri.fsPath(uri), "foo");
                expect(fs.statSync(FileUri.fsPath(uri)).isFile()).toEqual(true);

                await expect(fileSystem.createFile(uri.toString())).rejects.toBeDefined();
            }
        );

        test(
            "Should be rejected with an error if the encoding is given but cannot be handled.",
            async () => {
                const uri = root.resolve("foo.txt");
                expect(fs.existsSync(FileUri.fsPath(uri))).toEqual(false);

                await expect(fileSystem.createFile(uri.toString(), { encoding: "unknownEncoding" })).rejects.toBeDefined();
            }
        );

        test("Should create an empty file without any contents by default.", () => {
            const uri = root.resolve("foo.txt");
            expect(fs.existsSync(FileUri.fsPath(uri))).toEqual(false);

            return fileSystem.createFile(uri.toString()).then(stat => {
                expect(stat).toHaveProperty("uri", uri.toString());
                expect(stat).not.toHaveProperty("children");
                expect(fs.readFileSync(FileUri.fsPath(uri), "utf8")).toHaveLength(0);
            });
        });

        test("Should create a file with the desired content.", () => {
            const uri = root.resolve("foo.txt");
            expect(fs.existsSync(FileUri.fsPath(uri))).toEqual(false);

            return fileSystem.createFile(uri.toString(), { content: "foo" }).then(stat => {
                expect(stat).toHaveProperty("uri", uri.toString());
                expect(stat).not.toHaveProperty("children");
                expect(fs.readFileSync(FileUri.fsPath(uri), "utf8")).toEqual("foo");
            });
        });

        test(
            "Should create a file with the desired content into a non-existing, nested location.",
            () => {
                const uri = root.resolve("foo/bar/baz.txt");
                expect(fs.existsSync(FileUri.fsPath(uri))).toEqual(false);

                return fileSystem.createFile(uri.toString(), { content: "foo" }).then(stat => {
                    expect(stat).toHaveProperty("uri", uri.toString());
                    expect(stat).not.toHaveProperty("children");
                    expect(fs.readFileSync(FileUri.fsPath(uri), "utf8")).toEqual("foo");
                });
            }
        );

        test("Should create a file with the desired content and encoding.", () => {
            const uri = root.resolve("foo.txt");
            expect(fs.existsSync(FileUri.fsPath(uri))).toEqual(false);

            return fileSystem.createFile(uri.toString(), { content: "foo", encoding: "utf8" }).then(stat => {
                expect(stat).toHaveProperty("uri", uri.toString());
                expect(stat).not.toHaveProperty("children");
                expect(fs.readFileSync(FileUri.fsPath(uri), "utf8")).toEqual("foo");
            });
        });

    });

    describe("08 #createFolder", () => {

        test(
            "Should be rejected with an error if a directory already exist under the desired URI.",
            async () => {
                const uri = root.resolve("foo");
                fs.mkdirSync(FileUri.fsPath(uri));
                expect(fs.statSync(FileUri.fsPath(uri)).isDirectory()).toEqual(true);

                await expect(fileSystem.createFolder(uri.toString())).rejects.toBeDefined();
            }
        );

        test(
            "Should create a directory and return with the stat object on successful directory creation.",
            () => {
                const uri = root.resolve("foo");
                expect(fs.existsSync(FileUri.fsPath(uri))).toEqual(false);

                return fileSystem.createFolder(uri.toString()).then(stat => {
                    expect(stat).toHaveProperty("uri", uri.toString());
                    expect(stat).toHaveProperty("children", []);
                });
            }
        );

        test(
            "Should create a directory and return with the stat object on successful directory creation.",
            () => {
                const uri = root.resolve("foo/bar");
                expect(fs.existsSync(FileUri.fsPath(uri))).toEqual(false);

                return fileSystem.createFolder(uri.toString()).then(stat => {
                    expect(stat).toHaveProperty("uri", uri.toString());
                    expect(stat).toHaveProperty("children", []);
                });
            }
        );

    });

    describe("09 #touch", () => {

        test("Should create a new file if it does not exist yet.", () => {
            const uri = root.resolve("foo.txt");
            expect(fs.existsSync(FileUri.fsPath(uri))).toEqual(false);

            return fileSystem.touchFile(uri.toString()).then(stat => {
                expect(stat).toHaveProperty("uri", uri.toString());
                expect(fs.statSync(FileUri.fsPath(uri)).isFile()).toEqual(true);
            });
        });

        test("Should update the modification timestamp on an existing file.", done => {
            const uri = root.resolve("foo.txt");
            fs.writeFileSync(FileUri.fsPath(uri), "foo");
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).toEqual(true);

            fileSystem.getFileStat(uri.toString()).then(initialStat => {
                expect(initialStat).toHaveProperty("uri", uri.toString());
                expect(fs.statSync(FileUri.fsPath(uri)).isFile()).toEqual(true);
                return initialStat;
            }).then(initialStat => {
                // https://nodejs.org/en/docs/guides/working-with-different-filesystems/#timestamp-resolution
                sleep(1000).then(() => {
                    fileSystem.touchFile(uri.toString()).then(updatedStat => {
                        expect(updatedStat).toHaveProperty("uri", uri.toString());
                        expect(fs.statSync(FileUri.fsPath(uri)).isFile()).toEqual(true);
                        expect(updatedStat.lastModification).toBeGreaterThan(initialStat.lastModification);
                        done();
                    });
                });
            });
        });

    });

    describe("#10 delete", () => {

        test("Should be rejected when the file to delete does not exist.", async () => {
            const uri = root.resolve("foo.txt");
            expect(fs.existsSync(FileUri.fsPath(uri))).toEqual(false);

            await expect(fileSystem.delete(uri.toString(), { moveToTrash: false })).rejects.toBeDefined();
        });

        test("Should delete the file.", () => {
            const uri = root.resolve("foo.txt");
            fs.writeFileSync(FileUri.fsPath(uri), "foo");
            expect(fs.readFileSync(FileUri.fsPath(uri), "utf8")).toEqual("foo");

            return fileSystem.delete(uri.toString(), { moveToTrash: false }).then(() => {
                expect(fs.existsSync(FileUri.fsPath(uri))).toEqual(false);
            });
        });

        test("Should delete a directory without content.", () => {
            const uri = root.resolve("foo");
            fs.mkdirSync(FileUri.fsPath(uri));
            expect(fs.statSync(FileUri.fsPath(uri)).isDirectory()).toEqual(true);

            return fileSystem.delete(uri.toString(), { moveToTrash: false }).then(() => {
                expect(fs.existsSync(FileUri.fsPath(uri))).toEqual(false);
            });
        });

        test("Should delete a directory with all its content.", () => {
            const uri = root.resolve("foo");
            const subUri = uri.resolve("bar.txt");
            fs.mkdirSync(FileUri.fsPath(uri));
            fs.writeFileSync(FileUri.fsPath(subUri), "bar");
            expect(fs.statSync(FileUri.fsPath(uri)).isDirectory()).toEqual(true);
            expect(fs.readFileSync(FileUri.fsPath(subUri), "utf8")).toEqual("bar");

            return fileSystem.delete(uri.toString(), { moveToTrash: false }).then(() => {
                expect(fs.existsSync(FileUri.fsPath(uri))).toEqual(false);
                expect(fs.existsSync(FileUri.fsPath(subUri))).toEqual(false);
            });
        });

    });

    describe("#11 getEncoding", () => {

        test(
            "Should be rejected with an error if no file exists under the given URI.",
            async () => {
                const uri = root.resolve("foo.txt");
                expect(fs.existsSync(FileUri.fsPath(uri))).toEqual(false);

                await expect(fileSystem.getEncoding(uri.toString())).rejects.toBeDefined();
            }
        );

        test(
            "Should be rejected with an error if the URI points to a directory instead of a file.",
            async () => {
                const uri = root.resolve("foo");
                fs.mkdirSync(FileUri.fsPath(uri));
                expect(fs.statSync(FileUri.fsPath(uri)).isDirectory()).toEqual(true);

                await expect(fileSystem.getEncoding(uri.toString())).rejects.toBeDefined();
            }
        );

        test("Should return with the encoding of the file.", async () => {
            const uri = root.resolve("foo.txt");
            fs.writeFileSync(FileUri.fsPath(uri), "foo");
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).toEqual(true);

            await expect(fileSystem.getEncoding(uri.toString())).resolves.toEqual("utf8");
        });

    });

    describe("#14 roots", async () => {

        test("should not throw error", async () => {
            expect(await createFileSystem().getRoots()).toBeTruthy();
        });

    });

    describe("#15 currentUserHome", async () => {

        test("should exist", async () => {
            const actual = (await createFileSystem().getCurrentUserHome()).uri.toString();
            const expected = FileUri.create(os.homedir()).toString();
            expect(expected).toEqual(actual);
        });

    });

    function createFileSystem(): FileSystem {
        return new FileSystemNode();
    }

    function sleep(time: number) {
        return new Promise(resolve => setTimeout(resolve, time));
    }

});

process.on("unhandledRejection", (reason: any) => {
    console.error("Unhandled promise rejection: " + reason);
});
