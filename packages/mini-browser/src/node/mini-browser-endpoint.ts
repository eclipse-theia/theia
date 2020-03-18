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

import * as fs from 'fs-extra';
import { lookup } from 'mime-types';
import { injectable, inject, named } from 'inversify';
import { Application, Request, Response } from 'express';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { ILogger } from '@theia/core/lib/common/logger';
import { MaybePromise } from '@theia/core/lib/common/types';
import { FileSystem, FileStat } from '@theia/filesystem/lib/common';
import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { MiniBrowserService } from '../common/mini-browser-service';

/**
 * The return type of the `FileSystem#resolveContent` method.
 */
export interface FileStatWithContent {

    /**
     * The file stat.
     */
    readonly stat: FileStat;

    /**
     * The content of the file as a UTF-8 encoded string.
     */
    readonly content: string;

}

/**
 * Endpoint handler contribution for the `MiniBrowserEndpoint`.
 */
export const MiniBrowserEndpointHandler = Symbol('MiniBrowserEndpointHandler');
export interface MiniBrowserEndpointHandler {

    /**
     * Returns with or resolves to the file extensions supported by the current `mini-browser` endpoint handler.
     * The file extension must not start with the leading `.` (dot). For instance; `'html'` or `['jpg', 'jpeg']`.
     * The file extensions are case insensitive.
     */
    supportedExtensions(): MaybePromise<string | string[]>;

    /**
     * Returns a number representing the priority between all the available handlers for the same file extension.
     */
    priority(): number;

    /**
     * Responds back to the sender.
     */
    respond(statWithContent: FileStatWithContent, response: Response): MaybePromise<Response>;

}

@injectable()
export class MiniBrowserEndpoint implements BackendApplicationContribution, MiniBrowserService {

    /**
     * Endpoint path to handle the request for the given resource.
     */
    static HANDLE_PATH = '/mini-browser/';

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

    @inject(ContributionProvider)
    @named(MiniBrowserEndpointHandler)
    protected readonly contributions: ContributionProvider<MiniBrowserEndpointHandler>;

    protected readonly handlers: Map<string, MiniBrowserEndpointHandler> = new Map();

    configure(app: Application): void {
        app.get(`${MiniBrowserEndpoint.HANDLE_PATH}*`, async (request, response) => this.response(await this.getUri(request), response));
    }

    async onStart(): Promise<void> {
        for (const handler of this.getContributions()) {
            const extensions = await handler.supportedExtensions();
            for (const extension of (Array.isArray(extensions) ? extensions : [extensions]).map(e => e.toLocaleLowerCase())) {
                const existingHandler = this.handlers.get(extension);
                if (!existingHandler || handler.priority > existingHandler.priority) {
                    this.handlers.set(extension, handler);
                }
            }
        }
    }

    async supportedFileExtensions(): Promise<Readonly<{ extension: string, priority: number }>[]> {
        return Array.from(this.handlers.entries()).map(([extension, handler]) => ({ extension, priority: handler.priority() }));
    }

    protected async response(uri: string, response: Response): Promise<Response> {
        const exists = await this.fileSystem.exists(uri);
        if (!exists) {
            return this.missingResourceHandler()(uri, response);
        }
        const statWithContent = await this.readContent(uri);
        try {
            if (!statWithContent.stat.isDirectory) {
                const extension = uri.split('.').pop();
                if (!extension) {
                    return this.defaultHandler()(statWithContent, response);
                }
                const handler = this.handlers.get(extension.toString().toLocaleLowerCase());
                if (!handler) {
                    return this.defaultHandler()(statWithContent, response);
                }
                return handler.respond(statWithContent, response);
            }
        } catch (e) {
            return this.errorHandler()(e, uri, response);
        }
        return this.defaultHandler()(statWithContent, response);
    }

    protected getContributions(): MiniBrowserEndpointHandler[] {
        return this.contributions.getContributions();
    }

    protected getUri(request: Request): MaybePromise<string> {
        const decodedPath = request.path.substr(MiniBrowserEndpoint.HANDLE_PATH.length);
        return new URI(FileUri.create(decodedPath).toString(true)).toString(true);
    }

    protected async readContent(uri: string): Promise<FileStatWithContent> {
        return this.fileSystem.resolveContent(uri);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected errorHandler(): (error: any, uri: string, response: Response) => MaybePromise<Response> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return async (error: any, uri: string, response: Response) => {
            const details = error.toString ? error.toString() : error;
            this.logger.error(`Error occurred while handling request for ${uri}. Details: ${details}`);
            if (error instanceof Error) {
                let message = error.message;
                if (error.stack) {
                    message += `\n${error.stack}`;
                }
                this.logger.error(message);
            } else if (typeof error === 'string') {
                this.logger.error(error);
            } else {
                this.logger.error(`${error}`);
            }
            return response.send(500);
        };
    }

    protected missingResourceHandler(): (uri: string, response: Response) => MaybePromise<Response> {
        return async (uri: string, response: Response) => {
            this.logger.error(`Cannot handle missing resource. URI: ${uri}.`);
            return response.send();
        };
    }

    protected defaultHandler(): (statWithContent: FileStatWithContent, response: Response) => MaybePromise<Response> {
        return async (statWithContent: FileStatWithContent, response: Response) => {
            const { stat, content } = statWithContent;
            const mimeType = lookup(FileUri.fsPath(stat.uri));
            if (!mimeType) {
                this.logger.warn(`Cannot handle unexpected resource. URI: ${statWithContent.stat.uri}.`);
                response.contentType('application/octet-stream');
            } else {
                response.contentType(mimeType);
            }
            return response.send(content);
        };
    }

}

// See `EditorManager#canHandle`.
const CODE_EDITOR_PRIORITY = 100;

/**
 * Endpoint handler contribution for HTML files.
 */
@injectable()
export class HtmlHandler implements MiniBrowserEndpointHandler {

    supportedExtensions(): string[] {
        return ['html', 'xhtml', 'htm'];
    }

    priority(): number {
        // Prefer Code Editor over Mini Browser
        // https://github.com/eclipse-theia/theia/issues/2051
        return 1;
    }

    respond(statWithContent: FileStatWithContent, response: Response): MaybePromise<Response> {
        response.contentType('text/html');
        return response.send(statWithContent.content);
    }

}

/**
 * Handler for JPG resources.
 */
@injectable()
export class ImageHandler implements MiniBrowserEndpointHandler {

    supportedExtensions(): string[] {
        return ['jpg', 'jpeg', 'png', 'bmp', 'gif'];
    }

    priority(): number {
        return CODE_EDITOR_PRIORITY + 1;
    }

    respond(statWithContent: FileStatWithContent, response: Response): MaybePromise<Response> {
        fs.readFile(FileUri.fsPath(statWithContent.stat.uri), (error, data) => {
            if (error) {
                throw error;
            }
            response.contentType('image/jpeg');
            response.send(data);
        });
        return response;
    }

}

/**
 * PDF endpoint handler.
 */
@injectable()
export class PdfHandler implements MiniBrowserEndpointHandler {

    supportedExtensions(): string {
        return 'pdf';
    }

    priority(): number {
        return CODE_EDITOR_PRIORITY + 1;
    }

    respond(statWithContent: FileStatWithContent, response: Response): MaybePromise<Response> {
        // https://stackoverflow.com/questions/11598274/display-pdf-in-browser-using-express-js
        const encodeRFC5987ValueChars = (input: string) =>
            encodeURIComponent(input).
                // Note that although RFC3986 reserves "!", RFC5987 does not, so we do not need to escape it.
                replace(/['()]/g, escape). // i.e., %27 %28 %29
                replace(/\*/g, '%2A').
                // The following are not required for percent-encoding per RFC5987, so we can allow for a little better readability over the wire: |`^.
                replace(/%(?:7C|60|5E)/g, unescape);

        const fileName = FileUri.create(statWithContent.stat.uri).path.base;
        fs.readFile(FileUri.fsPath(statWithContent.stat.uri), (error, data) => {
            if (error) {
                throw error;
            }
            // Change `inline` to `attachment` if you would like to force downloading the PDF instead of previewing in the browser.
            response.setHeader('Content-disposition', `inline; filename*=UTF-8''${encodeRFC5987ValueChars(fileName)}`);
            response.contentType('application/pdf');
            response.send(data);
        });
        return response;
    }

}

/**
 * Endpoint contribution for SVG resources.
 */
@injectable()
export class SvgHandler implements MiniBrowserEndpointHandler {

    supportedExtensions(): string {
        return 'svg';
    }

    priority(): number {
        return 1;
    }

    respond(statWithContent: FileStatWithContent, response: Response): MaybePromise<Response> {
        response.contentType('image/svg+xml');
        return response.send(statWithContent.content);
    }

}
