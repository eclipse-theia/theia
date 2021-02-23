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
import * as fs from '@theia/core/shared/fs-extra';
import * as path from 'path';
import { v4 } from 'uuid';
import { Request, Response } from '@theia/core/shared/express';
import { inject, injectable } from '@theia/core/shared/inversify';
import { OK, BAD_REQUEST, METHOD_NOT_ALLOWED, NOT_FOUND, INTERNAL_SERVER_ERROR, REQUESTED_RANGE_NOT_SATISFIABLE, PARTIAL_CONTENT } from 'http-status-codes';
import URI from '@theia/core/lib/common/uri';
import { isEmpty } from '@theia/core/lib/common/objects';
import { ILogger } from '@theia/core/lib/common/logger';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { DirectoryArchiver } from './directory-archiver';
import { FileDownloadData } from '../../common/download/file-download-data';
import { FileDownloadCache, DownloadStorageItem } from './file-download-cache';

interface PrepareDownloadOptions {
    filePath: string;
    downloadId: string;
    remove: boolean;
    root?: string;
}

@injectable()
export abstract class FileDownloadHandler {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(DirectoryArchiver)
    protected readonly directoryArchiver: DirectoryArchiver;

    @inject(FileDownloadCache)
    protected readonly fileDownloadCache: FileDownloadCache;

    public abstract handle(request: Request, response: Response): Promise<void>;

    /**
     * Prepares the file and the link for download
     */
    protected async prepareDownload(request: Request, response: Response, options: PrepareDownloadOptions): Promise<void> {
        const name = path.basename(options.filePath);
        try {
            await fs.access(options.filePath, fs.constants.R_OK);
            const stat = await fs.stat(options.filePath);
            this.fileDownloadCache.addDownload(options.downloadId, { file: options.filePath, remove: options.remove, size: stat.size, root: options.root });
            // do not send filePath but instead use the downloadId
            const data = { name, id: options.downloadId };
            response.status(OK).send(data).end();
        } catch (e) {
            this.handleError(response, e, INTERNAL_SERVER_ERROR);
        }
    }

    protected async download(request: Request, response: Response, downloadInfo: DownloadStorageItem, id: string): Promise<void> {
        const filePath = downloadInfo.file;
        const statSize = downloadInfo.size;
        // this sets the content-disposition and content-type automatically
        response.attachment(filePath);
        try {
            await fs.access(filePath, fs.constants.R_OK);
            response.setHeader('Accept-Ranges', 'bytes');
            // parse range header and combine multiple ranges
            const range = this.parseRangeHeader(request.headers['range'], statSize);
            if (!range) {
                response.setHeader('Content-Length', statSize);
                this.streamDownload(OK, response, fs.createReadStream(filePath), id);
            } else {
                const rangeStart = range.start;
                const rangeEnd = range.end;
                if (rangeStart >= statSize || rangeEnd >= statSize) {
                    response.setHeader('Content-Range', `bytes */${statSize}`);
                    // Return the 416 'Requested Range Not Satisfiable'.
                    response.status(REQUESTED_RANGE_NOT_SATISFIABLE).end();
                    return;
                }
                response.setHeader('Content-Range', `bytes ${rangeStart}-${rangeEnd}/${statSize}`);
                response.setHeader('Content-Length', rangeStart === rangeEnd ? 0 : (rangeEnd - rangeStart + 1));
                response.setHeader('Cache-Control', 'no-cache');
                this.streamDownload(PARTIAL_CONTENT, response, fs.createReadStream(filePath, { start: rangeStart, end: rangeEnd }), id);
            }
        } catch (e) {
            this.fileDownloadCache.deleteDownload(id);
            this.handleError(response, e, INTERNAL_SERVER_ERROR);
        }
    }
    /**
     * Streams the file and pipe it to the Response to avoid any OOM issues
     */
    protected streamDownload(status: number, response: Response, stream: fs.ReadStream, id: string): void {
        response.status(status);
        stream.on('error', error => {
            this.fileDownloadCache.deleteDownload(id);
            this.handleError(response, error, INTERNAL_SERVER_ERROR);
        });
        response.on('error', error => {
            this.fileDownloadCache.deleteDownload(id);
            this.handleError(response, error, INTERNAL_SERVER_ERROR);
        });
        response.on('close', () => {
            stream.destroy();
        });
        stream.pipe(response);
    }
    protected parseRangeHeader(range: string | string[] | undefined, statSize: number): { start: number, end: number } | undefined {
        if (!range || range.length === 0 || Array.isArray(range)) {
            return;
        }
        const index = range.indexOf('=');
        if (index === -1) {
            return;
        }
        const rangeType = range.slice(0, index);
        if (rangeType !== 'bytes') {
            return;
        }
        const [start, end] = range.slice(index + 1).split('-').map(r => parseInt(r, 10));
        return {
            start: isNaN(start) ? 0 : start,
            end: (isNaN(end) || end > statSize - 1) ? (statSize - 1) : end
        };
    }
    protected async archive(inputPath: string, outputPath: string = path.join(os.tmpdir(), v4()), entries?: string[]): Promise<string> {
        await this.directoryArchiver.archive(inputPath, outputPath, entries);
        return outputPath;
    }

    protected async createTempDir(downloadId: string = v4()): Promise<string> {
        const outputPath = path.join(os.tmpdir(), downloadId);
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
    export const DOWNLOAD_LINK: symbol = Symbol('download');
}

@injectable()
export class DownloadLinkHandler extends FileDownloadHandler {

    async handle(request: Request, response: Response): Promise<void> {
        const { method, query } = request;
        if (method !== 'GET' && method !== 'HEAD') {
            this.handleError(response, `Unexpected HTTP method. Expected GET got '${method}' instead.`, METHOD_NOT_ALLOWED);
            return;
        }
        if (query === undefined || query.id === undefined || typeof query.id !== 'string') {
            this.handleError(response, `Cannot access the 'id' query from the request. The query was: ${JSON.stringify(query)}.`, BAD_REQUEST);
            return;
        }
        const cancelDownload = query.cancel;
        const downloadInfo = this.fileDownloadCache.getDownload(query.id);
        if (!downloadInfo) {
            this.handleError(response, `Cannot find the file from the request. The query was: ${JSON.stringify(query)}.`, NOT_FOUND);
            return;
        }
        // allow head request to determine the content length for parallel downloaders
        if (method === 'HEAD') {
            response.setHeader('Content-Length', downloadInfo.size);
            response.status(OK).end();
            return;
        }
        if (!cancelDownload) {
            this.download(request, response, downloadInfo, query.id);
        } else {
            this.logger.info('Download', query.id, 'has been cancelled');
            this.fileDownloadCache.deleteDownload(query.id);
        }
    }
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
        const filePath = FileUri.fsPath(uri);

        let stat: fs.Stats;
        try {
            stat = await fs.stat(filePath);
        } catch {
            this.handleError(response, `The file does not exist. URI: ${uri}.`, NOT_FOUND);
            return;
        }
        try {
            const downloadId = v4();
            const options: PrepareDownloadOptions = { filePath, downloadId, remove: false };
            if (!stat.isDirectory()) {
                await this.prepareDownload(request, response, options);
            } else {
                const outputRootPath = await this.createTempDir(downloadId);
                const outputPath = path.join(outputRootPath, `${path.basename(filePath)}.tar`);
                await this.archive(filePath, outputPath);
                options.filePath = outputPath;
                options.remove = true;
                options.root = outputRootPath;
                await this.prepareDownload(request, response, options);
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
            try {
                await fs.access(FileUri.fsPath(uri));
            } catch {
                this.handleError(response, `The file does not exist. URI: ${uri}.`, NOT_FOUND);
                return;
            }
        }
        try {
            const downloadId = v4();
            const outputRootPath = await this.createTempDir(downloadId);
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
            const options: PrepareDownloadOptions = { filePath: '', downloadId, remove: true, root: outputRootPath };
            if (tarPaths.length === 1) {
                // tslint:disable-next-line:whitespace
                const [outputPath,] = tarPaths;
                options.filePath = outputPath;
                await this.prepareDownload(request, response, options);
            } else {
                // We need to tar the tars.
                const outputPath = path.join(outputRootPath, `theia-archive-${Date.now()}.tar`);
                options.filePath = outputPath;
                await this.archive(outputRootPath, outputPath, tarPaths.map(p => path.relative(outputRootPath, p)));
                await this.prepareDownload(request, response, options);
            }
        } catch (e) {
            this.handleError(response, e, INTERNAL_SERVER_ERROR);
        }
    }

}
