/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as fs from 'fs-extra';
import { injectable, inject, named } from 'inversify';
import { Application, Request, Response } from 'express';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { ILogger } from '@theia/core/lib/common/logger';
import { FileSystem, FileStat } from '@theia/filesystem/lib/common';
import { MaybePromise, Prioritizeable } from '@theia/core/lib/common/types';
import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';

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
     * Returns with the file extensions supported by the current `mini-browser` endpoint handler.
     * The file extension must start with the leading `.` (dot). For instance; `'.html'` or `['.jpg', '.jpeg']`.
     * Extensions are case insensitive.
     */
    supportedExtensions(): string | string[];

    /**
     * Responds back to the sender.
     */
    respond(statWithContent: FileStatWithContent, response: Response): MaybePromise<Response>;

    /**
     * Returns or resolves to a positive number if the current contribution can handle the resource with the given URI.
     * The number indicates the priority of the endpoint contribution. If it is not a positive number, it means, the
     * contribution cannot handle the URI.
     */
    priority(uri: string): MaybePromise<number>;

}

@injectable()
export abstract class BaseMiniBrowserEndpointHandler implements MiniBrowserEndpointHandler {

    abstract supportedExtensions(): string | string[];

    abstract respond(statWithContent: FileStatWithContent, response: Response): MaybePromise<Response>;

    priority(uri: string): number {
        const extensions = this.supportedExtensions();
        // The handler for the extension should be case insensitive. For example; the handler accepts `'.jpg'` and the file extension is `.JPG`.
        return (Array.isArray(extensions) ? extensions : [extensions]).some(extension => uri.toLocaleLowerCase().endsWith(extension.toLocaleLowerCase())) ? 1 : 0;
    }

}

@injectable()
export class MiniBrowserEndpoint implements BackendApplicationContribution {

    /**
     * Endpoint path to handle the request for the given resource.
     */
    static HANDLE_PATH = '/mini-browser/';

    /**
     * Path for returning all the file extensions that are supported by all the available endpoint handler contributions.
     */
    static SUPPORTED_EXTENSIONS_PATH = '/mini-browser-supported-extensions/';

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

    @inject(ContributionProvider)
    @named(MiniBrowserEndpointHandler)
    protected readonly contributions: ContributionProvider<MiniBrowserEndpointHandler>;

    configure(app: Application): void {
        app.get(`${MiniBrowserEndpoint.HANDLE_PATH}*`, async (request, response) => await this.response(await this.getUri(request), response));
        app.get(`${MiniBrowserEndpoint.SUPPORTED_EXTENSIONS_PATH}`, async (request, response) => await this.supportedExtensions(await this.getUri(request), response));
    }

    protected async response(uri: string, response: Response): Promise<Response> {
        const exists = await this.fileSystem.exists(uri);
        if (!exists) {
            return this.missingResourceHandler()(uri, response);
        }
        const statWithContent = await this.readContent(uri);
        try {
            if (!statWithContent.stat.isDirectory) {
                const handlers = await this.prioritize(uri);
                if (handlers.length === 0) {
                    return this.defaultHandler()(statWithContent, response);
                }
                return handlers[0].respond(statWithContent, response);
            }
        } catch (e) {
            return this.errorHandler()(e, uri, response);
        }
        return this.defaultHandler()(statWithContent, response);
    }

    protected async supportedExtensions(uri: string, response: Response): Promise<Response> {
        const extensions = Array.from(new Set(([] as string[]).concat(...this.getContributions().map(c => c.supportedExtensions()).map(e => Array.isArray(e) ? e : [e]))));
        return response.send({ extensions });
    }

    protected async prioritize(uri: string): Promise<MiniBrowserEndpointHandler[]> {
        const prioritized = await Prioritizeable.prioritizeAll(this.getContributions(), contribution => contribution.priority(uri));
        return prioritized.map(p => p.value);
    }

    protected getContributions(): MiniBrowserEndpointHandler[] {
        return this.contributions.getContributions();
    }

    protected getUri(request: Request): MaybePromise<string> {
        const decodedPath = request.path.substr(MiniBrowserEndpoint.HANDLE_PATH.length);
        return new URI(FileUri.create(decodedPath).toString(true)).toString(true);
    }

    protected async readContent(uri: string): Promise<FileStatWithContent> {
        return await this.fileSystem.resolveContent(uri);
    }

    // tslint:disable-next-line:no-any
    protected errorHandler(): (error: any, uri: string, response: Response) => MaybePromise<Response> {
        // tslint:disable-next-line:no-any
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
            this.logger.warn(`Cannot handle unexpected resource. URI: ${statWithContent.stat.uri}.`);
            return response.send();
        };
    }

}

/**
 * Endpoint handler contribution for HTML files.
 */
@injectable()
export class HtmlHandler extends BaseMiniBrowserEndpointHandler {

    supportedExtensions(): string {
        return '.html';
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
export class ImageHandler extends BaseMiniBrowserEndpointHandler {

    supportedExtensions(): string[] {
        return ['.jpg', '.jpeg', '.png', '.bmp', 'gif'];
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
export class PdfHandler extends BaseMiniBrowserEndpointHandler {

    supportedExtensions(): string {
        return '.pdf';
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
export class SvgHandler extends BaseMiniBrowserEndpointHandler {

    supportedExtensions(): string {
        return '.svg';
    }

    respond(statWithContent: FileStatWithContent, response: Response): MaybePromise<Response> {
        response.contentType('text/xml');
        return response.send(statWithContent.content);
    }

}
