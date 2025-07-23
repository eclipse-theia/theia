// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

import { RequestOptions, RequestService } from '@theia/core/shared/@theia/request';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { MessageService, isWindows } from '@theia/core';
import * as cp from 'child_process';
import * as fs from '@theia/core/shared/fs-extra';
import * as net from 'net';
import * as path from 'path';
import * as os from 'os';
import URI from '@theia/core/lib/common/uri';
import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { HostedPluginUriPostProcessor, HostedPluginUriPostProcessorSymbolName } from './hosted-plugin-uri-postprocessor';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { LogType } from '@theia/plugin-ext/lib/common/types';
import { HostedPluginSupport } from '@theia/plugin-ext/lib/hosted/node/hosted-plugin';
import { MetadataScanner } from '@theia/plugin-ext/lib/hosted/node/metadata-scanner';
import { PluginDebugConfiguration } from '../common/plugin-dev-protocol';
import { HostedPluginProcess } from '@theia/plugin-ext/lib/hosted/node/hosted-plugin-process';
import { isENOENT } from '@theia/plugin-ext/lib/common/errors';

const DEFAULT_HOSTED_PLUGIN_PORT = 3030;

export const HostedInstanceManager = Symbol('HostedInstanceManager');

/**
 * Is responsible for running and handling separate Theia instance with given plugin.
 */
export interface HostedInstanceManager {
    /**
     * Checks whether hosted instance is run.
     */
    isRunning(): boolean;

    /**
     * Runs specified by the given uri plugin in separate Theia instance.
     *
     * @param pluginUri uri to the plugin source location
     * @param port port on which new instance of Theia should be run. Optional.
     * @returns uri where new Theia instance is run
     */
    run(pluginUri: URI, port?: number): Promise<URI>;

    /**
     * Runs specified by the given uri plugin  with debug in separate Theia instance.
     * @param pluginUri uri to the plugin source location
     * @param debugConfig debug configuration
     * @returns uri where new Theia instance is run
     */
    debug(pluginUri: URI, debugConfig: PluginDebugConfiguration): Promise<URI>;

    /**
     * Terminates hosted plugin instance.
     * Throws error if instance is not running.
     */
    terminate(): Promise<void>;

    /**
     * Returns uri where hosted instance is run.
     * Throws error if instance is not running.
     */
    getInstanceURI(): URI;

    /**
     * Returns uri where plugin loaded into hosted instance is located.
     * Throws error if instance is not running.
     */
    getPluginURI(): URI;

    /**
     * Checks whether given uri points to a valid plugin.
     *
     * @param uri uri to the plugin source location
     */
    isPluginValid(uri: URI): Promise<boolean>;
}

const HOSTED_INSTANCE_START_TIMEOUT_MS = 30000;
const THEIA_INSTANCE_REGEX = /.*Theia app listening on (.*).*\./;
const PROCESS_OPTIONS = {
    cwd: process.cwd(),
    env: { ...process.env }
};

/**
 * Enumeration of possible port validation issues
 */
enum PortValidationStatus {
    /** Port is valid and available */
    VALID = 'valid',
    /** Port number is outside the valid range (1-65535) */
    INVALID_RANGE = 'invalid_range',
    /** Port is already in use by another process */
    ALREADY_IN_USE = 'already_in_use'
}
interface PortValidationResult {
    status: PortValidationStatus;
    message: string;
}

@injectable()
export abstract class AbstractHostedInstanceManager implements HostedInstanceManager {
    protected hostedInstanceProcess: cp.ChildProcess;
    protected isPluginRunning: boolean = false;
    protected instanceUri: URI;
    protected pluginUri: URI;
    protected instanceOptions: Omit<RequestOptions, 'url'>;

    @inject(HostedPluginSupport)
    protected readonly hostedPluginSupport: HostedPluginSupport;

    @inject(MetadataScanner)
    protected readonly metadata: MetadataScanner;

    @inject(HostedPluginProcess)
    protected readonly hostedPluginProcess: HostedPluginProcess;

    @inject(RequestService)
    protected readonly request: RequestService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    isRunning(): boolean {
        return this.isPluginRunning;
    }

    async run(pluginUri: URI, port?: number): Promise<URI> {
        return this.doRun(pluginUri, port);
    }

    async debug(pluginUri: URI, debugConfig: PluginDebugConfiguration): Promise<URI> {
        return this.doRun(pluginUri, undefined, debugConfig);
    }

    private async doRun(pluginUri: URI, port?: number, debugConfig?: PluginDebugConfiguration): Promise<URI> {
        // Check if a plugin is already running - abort early if so
        if (this.isPluginRunning) {
            const message = 'Hosted plugin instance is already running.';
            await this.messageService.error(message);
            throw new Error(message);
        }

        // Check if the URI scheme is supported - abort early if not
        if (pluginUri.scheme !== 'file') {
            const message = 'Not supported plugin location: ' + pluginUri.toString();
            await this.messageService.error(message);
            throw new Error(message);
        }

        // Determine the port to use and check if it's available
        // This will throw an error if no valid port can be found, aborting the process
        const resolvedPort = await this.resolveAndCheckPort(port, debugConfig);

        const processOptions = { ...PROCESS_OPTIONS };
        // get filesystem path that works cross operating systems
        processOptions.env!.HOSTED_PLUGIN = FileUri.fsPath(pluginUri.toString());

        // Disable all the other plugins on this instance
        processOptions.env!.THEIA_PLUGINS = '';

        // Get the command to start the instance
        const command = await this.getStartCommand(resolvedPort, debugConfig);

        this.hostedPluginSupport.sendLog({ data: `will run hosted plugin theia instance with command: ${command.join()}`, type: LogType.Info });

        this.instanceUri = await this.postProcessInstanceUri(await this.runHostedPluginTheiaInstance(command, processOptions));
        this.pluginUri = pluginUri;
        // disable redirect to grab the release
        this.instanceOptions = {
            followRedirects: 0
        };
        this.instanceOptions = await this.postProcessInstanceOptions(this.instanceOptions);
        await this.checkInstanceUriReady();

        return this.instanceUri;
    }

    async terminate(): Promise<void> {
        if (this.isPluginRunning && !!this.hostedInstanceProcess?.pid) {
            this.hostedPluginProcess.killProcessTree(this.hostedInstanceProcess.pid);
            this.hostedPluginSupport.sendLog({ data: 'Hosted instance has been terminated', type: LogType.Info });
            this.isPluginRunning = false;

            // Call cleanup to handle resource cleanup after termination
            await this.cleanup();
        } else {
            throw new Error('Hosted plugin instance is not running.');
        }
    }

    /**
     * Clean up resources after termination.
     */
    protected async cleanup(): Promise<void> {
    }

    getInstanceURI(): URI {
        if (this.isPluginRunning) {
            return this.instanceUri;
        }
        throw new Error('Hosted plugin instance is not running.');
    }

    getPluginURI(): URI {
        if (this.isPluginRunning) {
            return this.pluginUri;
        }
        throw new Error('Hosted plugin instance is not running.');
    }

    /**
     * Checks that the `instanceUri` is responding before exiting method
     */
    public async checkInstanceUriReady(): Promise<void> {
        return new Promise<void>((resolve, reject) => this.pingLoop(60, resolve, reject));
    }

    /**
     * Start a loop to ping, if ping is OK return immediately, else start a new ping after 1second. We iterate for the given amount of loops provided in remainingCount
     * @param remainingCount the number of occurrence to check
     * @param resolve resolve function if ok
     * @param reject reject function if error
     */
    private async pingLoop(remainingCount: number,
        resolve: (value?: void | PromiseLike<void> | undefined | Error) => void,
        reject: (value?: void | PromiseLike<void> | undefined | Error) => void): Promise<void> {
        const isOK = await this.ping();
        if (isOK) {
            resolve();
        } else {
            if (remainingCount > 0) {
                setTimeout(() => this.pingLoop(--remainingCount, resolve, reject), 1000);
            } else {
                reject(new Error('Unable to ping the remote server'));
            }
        }
    }

    /**
     * Ping the plugin URI (checking status of the head)
     */
    private async ping(): Promise<boolean> {
        try {
            const url = this.instanceUri.toString();
            // Wait that the status is OK
            const response = await this.request.request({ url, type: 'HEAD', ...this.instanceOptions });
            return response.res.statusCode === 200;
        } catch {
            return false;
        }
    }

    async isPluginValid(uri: URI): Promise<boolean> {
        const pckPath = path.join(FileUri.fsPath(uri), 'package.json');
        try {
            const pck = await fs.readJSON(pckPath);
            this.metadata.getScanner(pck);
            return true;
        } catch (err) {
            if (!isENOENT(err)) {
                console.error(err);
            }
            return false;
        }
    }

    /**
     * Resolves the port from parameters or environment and checks if it's available.
     * If not, tries to find an alternative port.
     * @param port The port provided by the caller
     * @param debugConfig Debug configuration if any
     * @returns The resolved port number that is available for use
     */
    protected async resolveAndCheckPort(port?: number, debugConfig?: PluginDebugConfiguration): Promise<number> {
        let resolvedPort = port;
        if (!resolvedPort) {
            if (process.env.HOSTED_PLUGIN_PORT) {
                resolvedPort = Number(process.env.HOSTED_PLUGIN_PORT);
            } else {
                if (debugConfig?.debugPort) {
                    if (typeof debugConfig.debugPort === 'string') {
                        resolvedPort = Number(debugConfig.debugPort);
                    } else if (Array.isArray(debugConfig.debugPort) && debugConfig.debugPort.length > 0) {
                        resolvedPort = Number(debugConfig.debugPort[0].debugPort);
                    }
                }
            }

            if (!resolvedPort) {
                resolvedPort = DEFAULT_HOSTED_PLUGIN_PORT;
            }
        }
        const validationResult = await this.validatePort(resolvedPort);

        switch (validationResult.status) {
            case PortValidationStatus.VALID:
                return resolvedPort;

            case PortValidationStatus.INVALID_RANGE:
                // Port is outside the valid range, show error and abort
                await this.messageService.error(validationResult.message);
                throw new Error(validationResult.message);

            case PortValidationStatus.ALREADY_IN_USE:
                // Port is not available, try to find an alternative
                const alternativePort = await this.findFreePort();
                if (alternativePort) {
                    this.hostedPluginSupport.sendLog({ data: `Port ${resolvedPort} is already in use. Using alternative port ${alternativePort}.`, type: LogType.Info });
                    return alternativePort;
                } else {
                    const message = `Port ${resolvedPort} is already in use and no alternative port is available.`;
                    throw new Error(message);
                }
        }
    }

    /**
     * Find a free port starting from the given port number
     * @param startPort port to start checking from
     * @param maxAttempts maximum number of ports to check (defaults to 20)
     * @returns a free port number or undefined if none found
     */
    protected async findFreePort(maxAttempts: number = 20): Promise<number | undefined> {
        for (let i = 0; i < maxAttempts; i++) {
            const randomPort = Math.floor(Math.random() * (65535 - 49152)) + 49152;
            if (await this.isPortFree(randomPort)) {
                return randomPort;
            }
        }

        return undefined;
    }


    protected async getStartCommand(port: number, debugConfig?: PluginDebugConfiguration): Promise<string[]> {
        const processArguments = process.argv;

        const command = processArguments.filter((arg, index, args) => {
            // remove --port=X and --port X arguments if set
            // according to process.argv documentation, the first argument is the path to the node executable
            // and the second argument is the path to the script being executed
            // second argument will be treated as the workspace location, so it should be ignored
            if (index === 1 || arg.startsWith('--port') || args[index - 1] === '--port') {
                return;
            } else {
                return arg;
            }
        });

        // create a second backend instance
        command.push('--no-cluster');

        if (process.env.HOSTED_PLUGIN_HOSTNAME) {
            command.push('--hostname=' + process.env.HOSTED_PLUGIN_HOSTNAME);
        }
        if (port) {
            command.push('--port=' + port);
        }

        if (debugConfig) {
            if (debugConfig.debugPort === undefined) {
                command.push(`--hosted-plugin-${debugConfig.debugMode || 'inspect'}=0.0.0.0`);
            } else if (typeof debugConfig.debugPort === 'string') {
                command.push(`--hosted-plugin-${debugConfig.debugMode || 'inspect'}=0.0.0.0:${debugConfig.debugPort}`);
            } else if (Array.isArray(debugConfig.debugPort)) {
                if (debugConfig.debugPort.length === 0) {
                    // treat empty array just like undefined
                    command.push(`--hosted-plugin-${debugConfig.debugMode || 'inspect'}=0.0.0.0`);
                } else {
                    for (const serverToPort of debugConfig.debugPort) {
                        command.push(`--${serverToPort.serverName}-${debugConfig.debugMode || 'inspect'}=0.0.0.0:${serverToPort.debugPort}`);
                    }
                }
            }
        }
        return command;
    }

    protected async postProcessInstanceUri(uri: URI): Promise<URI> {
        return uri;
    }

    protected async postProcessInstanceOptions(options: Omit<RequestOptions, 'url'>): Promise<Omit<RequestOptions, 'url'>> {
        return options;
    }

    protected runHostedPluginTheiaInstance(command: string[], options: cp.SpawnOptions): Promise<URI> {
        this.isPluginRunning = true;
        return new Promise((resolve, reject) => {
            let started = false;
            const outputListener = (data: string | Buffer) => {
                const line = data.toString();
                const match = THEIA_INSTANCE_REGEX.exec(line);
                if (match) {
                    this.hostedInstanceProcess.stdout!.removeListener('data', outputListener);
                    started = true;
                    resolve(new URI(match[1]));
                }
            };

            // Has to be set for running on windows (electron).
            // See also: https://github.com/nodejs/node/issues/3675
            options.shell = true;

            this.hostedInstanceProcess = cp.spawn(command.shift()!, command, options);
            this.hostedInstanceProcess.on('error', err => {
                this.isPluginRunning = false;
                this.hostedPluginSupport.sendLog({ data: `Failed to start;  ${err.message} `, type: LogType.Error });
            });
            this.hostedInstanceProcess.on('exit', code => {
                this.isPluginRunning = false;
                if (code && code !== 0) {
                    this.hostedPluginSupport.sendLog({ data: `Exited with code  ${code} `, type: LogType.Error });
                }
            });
            this.hostedInstanceProcess.stdout!.addListener('data', outputListener);

            this.hostedInstanceProcess.stdout!.addListener('data', data => {
                this.hostedPluginSupport.sendLog({ data: data.toString(), type: LogType.Info });
            });
            this.hostedInstanceProcess.stderr!.addListener('data', data => {
                this.hostedPluginSupport.sendLog({ data: data.toString(), type: LogType.Error });
            });

            setTimeout(() => {
                if (!started) {
                    this.terminate();
                    this.isPluginRunning = false;
                    const timeoutError = 'Timeout starting hosted instance.';
                    this.messageService.error(timeoutError);
                    this.hostedPluginSupport.sendLog({ data: timeoutError, type: LogType.Info });
                    reject(new Error(timeoutError));
                }
            }, HOSTED_INSTANCE_START_TIMEOUT_MS);
        });
    }



    /**
     * Validates that the port is in a valid range and is available.
     * Returns a validation result object with explicit status code instead of throwing an error.
     * @param port The port to validate
     * @returns A validation result object with status code and message
     */
    protected async validatePort(port: number): Promise<PortValidationResult> {
        if (port < 1 || port > 65535) {
            return {
                status: PortValidationStatus.INVALID_RANGE,
                message: 'Port value is incorrect.'
            };
        }

        if (! await this.isPortFree(port)) {
            return {
                status: PortValidationStatus.ALREADY_IN_USE,
                message: 'Port ' + port + ' is already in use.'
            };
        }

        return {
            status: PortValidationStatus.VALID,
            message: 'Port ' + port + ' is available.'
        };
    }

    protected isPortFree(port: number): Promise<boolean> {
        return new Promise(resolve => {
            const server = net.createServer();
            server.listen(port, '0.0.0.0');
            server.on('error', () => {
                resolve(false);
            });
            server.on('listening', () => {
                server.close();
                resolve(true);
            });
        });
    }

}

@injectable()
export class NodeHostedPluginRunner extends AbstractHostedInstanceManager {
    @inject(ContributionProvider) @named(Symbol.for(HostedPluginUriPostProcessorSymbolName))
    protected readonly uriPostProcessors: ContributionProvider<HostedPluginUriPostProcessor>;

    protected override async postProcessInstanceUri(uri: URI): Promise<URI> {
        for (const uriPostProcessor of this.uriPostProcessors.getContributions()) {
            uri = await uriPostProcessor.processUri(uri);
        }
        return uri;
    }

    protected override async postProcessInstanceOptions(options: object): Promise<object> {
        for (const uriPostProcessor of this.uriPostProcessors.getContributions()) {
            options = await uriPostProcessor.processOptions(options);
        }
        return options;
    }
}

@injectable()
export class ElectronNodeHostedPluginRunner extends AbstractHostedInstanceManager {
    private tempDirectoryPath: string | undefined;

    protected override async getStartCommand(port: number, debugConfig?: PluginDebugConfiguration): Promise<string[]> {
        const command = await super.getStartCommand(port, debugConfig);
        this.tempDirectoryPath = `${this.getTempDir()}/theia-extension-host-${Math.floor(Math.random() * 1000000)}`;
        command.push(`--electronUserData="${this.tempDirectoryPath}"`);
        return command;
    }

    protected getTempDir(): string {
        const tempDir = os.tmpdir();
        return process.platform === 'darwin' ? fs.realpathSync(tempDir) : tempDir;
    }

    protected getTimestamp(): string {
        return `${Math.round(new Date().getTime() / 1000)} `;
    }

    /**
     * Clean up the temporary directory created for the Electron instance.
     */
    protected override async cleanup(): Promise<void> {
        await super.cleanup();

        if (this.tempDirectoryPath && fs.existsSync(this.tempDirectoryPath)) {
            try {
                await fs.remove(this.tempDirectoryPath);
                const message = `Temporary directory ${this.tempDirectoryPath} has been cleaned up`;
                this.hostedPluginSupport.sendLog({ data: message, type: LogType.Info });
            } catch (error) {
                const errorMessage = `Failed to clean up temporary directory ${this.tempDirectoryPath}: ${error} `;
                this.hostedPluginSupport.sendLog({ data: errorMessage, type: LogType.Error });
            }
        }
        this.tempDirectoryPath = undefined;
    }
}

