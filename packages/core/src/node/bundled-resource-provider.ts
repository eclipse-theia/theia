// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { inject, injectable, interfaces, named } from 'inversify';
import { EnvVariablesServer } from '../common/env-variables';
import { FileUri } from '../common/file-uri';
import { ILogger } from '../common/logger';
import { FileSystemLocking } from './filesystem-locking';

export const BundledResourceProvider = Symbol('BundledResourceProvider') as symbol & interfaces.Abstract<BundledResourceProvider>;
/**
 * Provides paths to resources that are bundled with the application, in a form that can also be used by
 * processes which do not run inside the application, such as shells, debug adapters or other external tools.
 *
 * When an Electron application is packaged with `asar: true`, the resources of the application are stored in
 * an `app.asar` archive. Paths pointing into such an archive can only be read through Electron's patched `fs`
 * module, so handing them to an external process fails. Therefore, always resolve a bundled resource through
 * this service before passing its path to a process outside of the application.
 */
export interface BundledResourceProvider {
    /**
     * Resolve the given path of a bundled file or directory to a path that external processes can read.
     *
     * If the resource is not packaged into an archive, its path is returned unchanged. Otherwise the copy that
     * the packaging step has left outside of the archive is used, if it is complete, and the resource is
     * extracted from the archive into the configuration directory as a last resort.
     *
     * Results are cached, so that a resource is extracted at most once per application version.
     *
     * @param resourcePath the path of the bundled resource, typically resolved against `__dirname`.
     * @returns the path to use outside of the application.
     * @throws if the resource does not exist or cannot be made available.
     */
    resolveExternalPath(resourcePath: string): Promise<string>;
}

@injectable()
export class BundledResourceProviderImpl implements BundledResourceProvider {

    @inject(ILogger) @named('core:BundledResourceProviderImpl')
    protected readonly logger: ILogger;

    @inject(EnvVariablesServer)
    protected readonly envVariablesServer: EnvVariablesServer;

    @inject(FileSystemLocking)
    protected readonly fileSystemLocking: FileSystemLocking;

    /** The folder within the configuration directory into which resources are extracted. */
    protected readonly extractionFolder = 'bundled-resources';

    /** Resources extracted for another application version are removed when they are older than this. */
    protected readonly staleExtractionAge = 7 * 24 * 60 * 60 * 1000;

    protected readonly resolved = new Map<string, Promise<string>>();
    protected temporaryExtractionPath: Promise<string> | undefined;

    async resolveExternalPath(resourcePath: string): Promise<string> {
        const normalizedPath = path.resolve(resourcePath);
        const pending = this.resolved.get(normalizedPath);
        if (pending) {
            try {
                const resolvedPath = await pending;
                if (await this.exists(resolvedPath)) {
                    return resolvedPath;
                }
            } catch {
                // the previous attempt failed, so try again below
            }
            this.resolved.delete(normalizedPath);
        }
        const result = this.doResolveExternalPath(normalizedPath);
        this.resolved.set(normalizedPath, result);
        return result;
    }

    protected async doResolveExternalPath(resourcePath: string): Promise<string> {
        if (!await this.exists(resourcePath)) {
            throw new Error(`Bundled resource does not exist: ${resourcePath}`);
        }
        const archivePath = this.findArchivePath(resourcePath);
        if (!archivePath) {
            // The resource is not packaged into an archive, so external processes can read it directly.
            return resourcePath;
        }
        const relativePath = path.relative(archivePath, resourcePath);
        const unpackedPath = path.join(`${archivePath}.unpacked`, relativePath);
        if (await this.isExtracted(resourcePath, unpackedPath)) {
            return unpackedPath;
        }
        const extractionPath = path.join(await this.getExtractionPath(archivePath), relativePath);
        await this.fileSystemLocking.lockPath(archivePath, () => this.extract(resourcePath, extractionPath));
        this.logger.info(`Extracted bundled resource '${resourcePath}' to '${extractionPath}'.`);
        return extractionPath;
    }

    /**
     * Find the archive that the given resource is packaged into, if any.
     *
     * @returns the path of the archive, i.e. the shortest prefix of the given path ending in an `.asar` segment,
     * which is also how Electron itself determines the archive that a path refers to.
     */
    protected findArchivePath(resourcePath: string): string | undefined {
        const segments = resourcePath.split(/[\\/]/);
        const archiveIndex = segments.findIndex(segment => segment.toLowerCase().endsWith('.asar'));
        return archiveIndex < 0 ? undefined : segments.slice(0, archiveIndex + 1).join(path.sep);
    }

    /**
     * Whether every file of the given resource is already available at the given target path. Packaging tools
     * only unpack the files that the application configured them to unpack, so a partial copy must be ignored.
     */
    protected async isExtracted(resourcePath: string, targetPath: string): Promise<boolean> {
        for (const file of await this.collectFiles(resourcePath)) {
            if (!await this.exists(path.join(targetPath, file))) {
                return false;
            }
        }
        return true;
    }

    protected async extract(resourcePath: string, targetPath: string): Promise<void> {
        for (const file of await this.collectFiles(resourcePath)) {
            await this.copyFile(path.join(resourcePath, file), path.join(targetPath, file));
        }
    }

    /**
     * Collect the files of the given resource as paths relative to it. The relative path of a resource that is
     * a plain file is the empty string.
     */
    protected async collectFiles(resourcePath: string, relativePath: string = ''): Promise<string[]> {
        const currentPath = path.join(resourcePath, relativePath);
        if (!(await fs.promises.stat(currentPath)).isDirectory()) {
            return [relativePath];
        }
        const files: string[] = [];
        for (const entry of await fs.promises.readdir(currentPath)) {
            files.push(...await this.collectFiles(resourcePath, path.join(relativePath, entry)));
        }
        return files;
    }

    protected async copyFile(sourcePath: string, targetPath: string): Promise<void> {
        const sourceStat = await fs.promises.stat(sourcePath);
        if (await this.isUpToDate(targetPath, sourceStat)) {
            return;
        }
        await fs.promises.mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
        // Write to a temporary file and move it into place, so that a concurrently starting application
        // instance never reads partially written content.
        const temporaryPath = `${targetPath}.${process.pid}.tmp`;
        try {
            // Electron reports the files of an asar archive as not executable, even those that the archive marks as
            // executable, so every extracted file is made executable for the owner to keep bundled executables usable.
            await fs.promises.writeFile(temporaryPath, await fs.promises.readFile(sourcePath), { mode: sourceStat.mode & 0o777 | 0o700 });
            try {
                await fs.promises.rename(temporaryPath, targetPath);
            } catch {
                // renaming onto an existing file is not supported on all platforms
                await fs.promises.rm(targetPath, { force: true });
                await fs.promises.rename(temporaryPath, targetPath);
            }
        } finally {
            await fs.promises.rm(temporaryPath, { force: true });
        }
    }

    protected async isUpToDate(targetPath: string, sourceStat: fs.Stats): Promise<boolean> {
        try {
            return (await fs.promises.stat(targetPath)).size === sourceStat.size;
        } catch {
            return false;
        }
    }

    /**
     * The directory into which resources of the given archive are extracted. It is specific to the content of
     * the archive, so that updating the application invalidates previously extracted copies.
     */
    protected async getExtractionPath(archivePath: string): Promise<string> {
        const archiveName = path.basename(archivePath, path.extname(archivePath));
        try {
            const extractionRoot = path.join(FileUri.fsPath(await this.envVariablesServer.getConfigDirUri()), this.extractionFolder);
            const extractionPath = path.join(extractionRoot, `${archiveName}-${this.getArchiveStamp(archivePath)}`);
            await fs.promises.mkdir(extractionPath, { recursive: true, mode: 0o700 });
            this.removeStaleExtractions(extractionRoot, `${archiveName}-`, extractionPath);
            return extractionPath;
        } catch (error) {
            this.logger.warn('Could not extract bundled resources into the configuration directory, using a temporary directory instead.', error);
            return this.getTemporaryExtractionPath();
        }
    }

    /**
     * Fallback for applications whose configuration directory cannot be written to. The directory is unique to
     * this run of the application, so that resources are extracted again whenever the application is started.
     */
    protected getTemporaryExtractionPath(): Promise<string> {
        return this.temporaryExtractionPath ??= fs.promises.mkdtemp(path.join(os.tmpdir(), 'theia-bundled-resources-'));
    }

    /**
     * Identify the content of the given archive. `process.noAsar` is toggled around the synchronous `stat` call
     * to get the stats of the archive file itself rather than of the directory that it appears as.
     */
    protected getArchiveStamp(archivePath: string): string {
        const asarProcess = process as NodeJS.Process & { noAsar?: boolean };
        const noAsar = asarProcess.noAsar;
        try {
            asarProcess.noAsar = true;
            const stat = fs.statSync(archivePath);
            return crypto.createHash('sha256').update(`${archivePath}:${stat.size}:${stat.mtimeMs}`).digest('hex').substring(0, 12);
        } finally {
            asarProcess.noAsar = noAsar;
        }
    }

    /**
     * Remove resources that were extracted from an earlier version of the archive, unless they were used
     * recently, because another application instance may still be running on that version.
     */
    protected removeStaleExtractions(extractionRoot: string, prefix: string, currentPath: string): void {
        const removeStale = async () => {
            for (const entry of await fs.promises.readdir(extractionRoot)) {
                const entryPath = path.join(extractionRoot, entry);
                if (!entry.startsWith(prefix) || entryPath === currentPath) {
                    continue;
                }
                const stat = await fs.promises.stat(entryPath);
                if (Date.now() - stat.mtimeMs > this.staleExtractionAge) {
                    await fs.promises.rm(entryPath, { recursive: true, force: true });
                    this.logger.info(`Removed stale extracted resources: ${entryPath}`);
                }
            }
        };
        removeStale().catch(error => this.logger.warn(`Could not remove stale extracted resources in '${extractionRoot}'.`, error));
    }

    protected async exists(targetPath: string): Promise<boolean> {
        try {
            await fs.promises.stat(targetPath);
            return true;
        } catch {
            return false;
        }
    }

}
