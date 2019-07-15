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

import * as os from 'os';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as rimraf from 'rimraf';
import { v4 } from 'uuid';
import { lookup } from 'mime-types';
import { Request, Response } from 'express';
import { inject, injectable } from 'inversify';
import { OK, BAD_REQUEST, METHOD_NOT_ALLOWED, NOT_FOUND, INTERNAL_SERVER_ERROR } from 'http-status-codes';
import URI from '@theia/core/lib/common/uri';
import { isEmpty } from '@theia/core/lib/common/objects';
import { ILogger } from '@theia/core/lib/common/logger';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { FileSystem } from '../../common/filesystem';
import { DirectoryArchiver } from './directory-archiver';
import { FileDownloadData } from '../../common/download/file-download-data';

@injectable()
export abstract class FileDownloadHandler {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

    @inject(DirectoryArchiver)
    protected readonly directoryArchiver: DirectoryArchiver;

    public abstract handle(request: Request, response: Response): Promise<void>;

    protected async download(filePath: string, request: Request, response: Response): Promise<void> {
        const name = path.basename(filePath);
        const mimeType = lookup(filePath);
        if (mimeType) {
            response.contentType(mimeType);
        } else {
            this.logger.debug(`Cannot determine the content-type for file: ${filePath}. Skipping the 'Content-type' header from the HTTP response.`);
        }
        response.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(name)}`);
        try {
            await fs.access(filePath, fs.constants.R_OK);
            fs.readFile(filePath, (error, data) => {
                if (error) {
                    this.handleError(response, error, INTERNAL_SERVER_ERROR);
                    return;
                }
                response.status(OK).send(data).end();
            });
        } catch (e) {
            this.handleError(response, e, INTERNAL_SERVER_ERROR);
        }
    }

    protected async archive(inputPath: string, outputPath: string = path.join(os.tmpdir(), v4()), entries?: string[]): Promise<string> {
        await this.directoryArchiver.archive(inputPath, outputPath, entries);
        return outputPath;
    }

    protected async deleteRecursively(pathToDelete: string): Promise<void> {
        rimraf(pathToDelete, error => {
            if (error) {
                this.logger.warn(`An error occurred while deleting the temporary data from the disk. Cannot clean up: ${pathToDelete}.`, error);
            }
        });
    }

    protected async createTempDir(): Promise<string> {
        const outputPath = path.join(os.tmpdir(), v4());
        await fs.mkdir(outputPath);
        return outputPath;
    }

    protected async handleError(response: Response, reason: string | Error, status: number = INTERNAL_SERVER_ERROR): Promise<void> {
        this.logger.error(reason);
        response.status(status).send('Unable to download file.').end();
    }

}

export namespace FileDownloadHandler {
    export const SINGLE: symbol = Symbol('single');
    export const MULTI: symbol = Symbol('multi');
}

@injectable()
export class SingleFileDownloadHandler extends FileDownloadHandler {

    async handle(request: Request, response: Response): Promise<void> {
        const { method, body, query } = request;
        if (method !== 'GET') {
            this.handleError(response, `Unexpected HTTP method. Expected GET got '${method}' instead.`, METHOD_NOT_ALLOWED);
            return;
        }
        if (body !== undefined && !isEmpty(body)) {
            this.handleError(response, `The request body must either undefined or empty when downloading a single file. The body was: ${JSON.stringify(body)}.`, BAD_REQUEST);
            return;
        }
        if (query === undefined || query.uri === undefined || typeof query.uri !== 'string') {
            this.handleError(response, `Cannot access the 'uri' query from the request. The query was: ${JSON.stringify(query)}.`, BAD_REQUEST);
            return;
        }
        const uri = new URI(query.uri).toString(true);
        const stat = await this.fileSystem.getFileStat(uri);
        if (stat === undefined) {
            this.handleError(response, `The file does not exist. URI: ${uri}.`, NOT_FOUND);
            return;
        }
        try {
            const filePath = FileUri.fsPath(uri);
            if (!stat.isDirectory) {
                await this.download(filePath, request, response);
            } else {
                const outputRootPath = path.join(os.tmpdir(), v4());
                await fs.mkdir(outputRootPath);
                const outputPath = path.join(outputRootPath, `${path.basename(filePath)}.tar`);
                await this.archive(filePath, outputPath);
                await this.download(outputPath, request, response);
                this.deleteRecursively(outputPath);
            }
        } catch (e) {
            this.handleError(response, e, INTERNAL_SERVER_ERROR);
        }
    }

}

@injectable()
export class MultiFileDownloadHandler extends FileDownloadHandler {

    async handle(request: Request, response: Response): Promise<void> {
        const { method, body } = request;
        if (method !== 'PUT') {
            this.handleError(response, `Unexpected HTTP method. Expected PUT got '${method}' instead.`, METHOD_NOT_ALLOWED);
            return;
        }
        if (body === undefined) {
            this.handleError(response, 'The request body must be defined when downloading multiple files.', BAD_REQUEST);
            return;
        }
        if (!FileDownloadData.is(body)) {
            this.handleError(response, `Unexpected body format. Cannot extract the URIs from the request body. Body was: ${JSON.stringify(body)}.`, BAD_REQUEST);
            return;
        }
        if (body.uris.length === 0) {
            this.handleError(response, `Insufficient body format. No URIs were defined by the request body. Body was: ${JSON.stringify(body)}.`, BAD_REQUEST);
            return;
        }
        for (const uri of body.uris) {
            const stat = await this.fileSystem.getFileStat(uri);
            if (stat === undefined) {
                this.handleError(response, `The file does not exist. URI: ${uri}.`, NOT_FOUND);
                return;
            }
        }
        try {
            const outputRootPath = path.join(os.tmpdir(), v4());
            await fs.mkdir(outputRootPath);
            const distinctUris = Array.from(new Set(body.uris.map(uri => new URI(uri))));
            const tarPaths = [];
            // We should have one key in the map per FS drive.
            for (const [rootUri, uris] of (await this.directoryArchiver.findCommonParents(distinctUris)).entries()) {
                const rootPath = FileUri.fsPath(rootUri);
                const entries = uris.map(FileUri.fsPath).map(p => path.relative(rootPath, p));
                const outputPath = path.join(outputRootPath, `${path.basename(rootPath)}.tar`);
                await this.archive(rootPath, outputPath, entries);
                tarPaths.push(outputPath);
            }

            if (tarPaths.length === 1) {
                // tslint:disable-next-line:whitespace
                const [outputPath,] = tarPaths;
                await this.download(outputPath, request, response);
                this.deleteRecursively(outputRootPath);
            } else {
                // We need to tar the tars.
                const outputPath = path.join(outputRootPath, `theia-archive-${Date.now()}.tar`);
                await this.archive(outputRootPath, outputPath, tarPaths.map(p => path.relative(outputRootPath, p)));
                await this.download(outputPath, request, response);
                this.deleteRecursively(outputRootPath);
            }
        } catch (e) {
            this.handleError(response, e, INTERNAL_SERVER_ERROR);
        }
    }

}
