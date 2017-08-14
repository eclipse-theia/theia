/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { JsonRpcServer } from "@theia/core";

export const extensionPath = '/services/extensions';

/**
 * The raw extension information from the repository.
 */
export class RawExtension {
    readonly name: string;
    readonly version: string;
    readonly description: string;
    readonly author: string;
}

/**
 * The detailed extension information from the repository.
 */
export class ResolvedRawExtension extends RawExtension {
    /**
     * The detailed description of the extension in HTML.
     */
    readonly documentation: string;
}

/**
 * The extension consists of the raw information and the installation state.
 */
export class Extension extends RawExtension {
    /**
     * Test whether the extension is busy with installing, updating or uninstalling.
     */
    readonly busy: boolean;
    /**
     * Test whether the extension is installed.
     */
    readonly installed: boolean;
    /**
     * Test whether the extension should be updated.
     */
    readonly outdated: boolean;
}

/**
 * The resolved extension allows to access its detailed information.
 */
export type ResolvedExtension = Extension & ResolvedRawExtension;

/**
 * The search param to look up extension from the repository.
 */
export interface SearchParam {
    /**
     * The query with support for filters and other modifiers, see https://api-docs.npms.io/#api-Search.
     * The search is always narrowed with extensino keywords, e.g. `keywords:theia-extension` is always appended by default.
     */
    readonly query: string;
    /**
     * The offset in which to start searching from (max of 5000).
     * Default value: 0.
     */
    readonly from?: number;
    /**
     * The total number of results to return (max of 250)
     * Default value: 25
     */
    readonly size?: number;
}

export const ExtensionServer = Symbol('ExtensionServer');
/**
 * The extension server allows to:
 * - look up raw extensions from the repository and resolve the detailed information about them;
 * - list installed extensions as well as install and uninstall them;
 * - list outdated extensions as well as update them;
 * - look up extensions from the repository taking into the account installed extensions.
 *
 * The extension server could start the installation process when an extension is installed, uninstalled or updated.
 * The user code should use the extension client to listen to changes of installed extensions and the installation process.
 */
export interface ExtensionServer extends JsonRpcServer<ExtensionClient> {
    /**
     * Look up raw extensions from the repository matching the given query.
     */
    search(param: SearchParam): Promise<RawExtension[]>;
    /**
     * Resolve the detailed extension information from the repository.
     */
    resolveRaw(extension: string): Promise<ResolvedRawExtension>;

    /**
     * List installed extensions.
     */
    installed(): Promise<RawExtension[]>;
    /**
     * Install the latest version of the given extension.
     */
    install(extension: string): Promise<void>;
    /**
     * Uninstall the given extension.
     */
    uninstall(extension: string): Promise<void>;

    /**
     * List outdated extensions which is subset of installed extensions.
     */
    outdated(): Promise<RawExtension[]>;
    /**
     * Update the given extension to the latest version.
     */
    update(extension: string): Promise<void>;

    /**
     * List installed extensions if the given query is undefined or empty.
     * Otherwise look up extensions from the repository matching the given query
     * taking into the account installed extensions.
     */
    list(param?: SearchParam): Promise<Extension[]>;
    /**
     * Resolve the detailed extension from the repository
     * taking into the account installed extensions.
     */
    resolve(extension: string): Promise<ResolvedExtension>;

    /**
     * Test whether the installation process should be scheduled
     * to apply extension changes.
     */
    needInstall(): Promise<boolean>;
    /**
     * Schedule the installation process to apply extension changes.
     */
    scheduleInstall(): Promise<void>;
}

/**
 * The installation process result.
 */
export interface DidStopInstallationParam {
    /**
     * Test whether the installation process is failed.
     */
    readonly failed: boolean;
}

export type ExtensionChange = Pick<Extension, 'name'> & Partial<Extension>;

export const ExtensionClient = Symbol('ExtensionClient');
/**
 * The extension client allows listening to changes of:
 * - installed extensions;
 * - the installation process.
 */
export interface ExtensionClient {
    /**
     * Notify when extensions are installed, uninsalled or updated.
     */
    onDidChange(change: ExtensionChange): void;
    /**
     * Notiy when the installation process is going to be started.
     */
    onWillStartInstallation(): void;
    /**
     * Notiy when the installation process has been finished.
     */
    onDidStopInstallation(param: DidStopInstallationParam): void;
}
