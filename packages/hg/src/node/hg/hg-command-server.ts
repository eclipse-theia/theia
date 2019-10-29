/********************************************************************************
 * Copyright (C) 2019 Arm and others.
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

import { ChildProcess } from 'child_process';
import { promisify } from 'util';

/**
 * Type representing a chunk of stdout corresponding to different channels.
 */
export type OutputChunk
    = { channel: 'I' | 'L', length: number } // Channels requesting input with the given length
    | { channel: 'e' | 'o', body: string }
    | { channel: 'r', body: number };

/**
 * First message sent by hg after starting the server.
 */
export interface HelloMessage {
    capabilities: string[];
    encoding: string;
}

/**
 * State of the command server:
 * - initial: `start` has not been called
 * - starting: waiting for hello message
 * - ready: command server is waiting for commands
 * - running: command server is running a command
 * - stopped: server process has ended
 */
type ServerState
    = { type: 'initial' | 'starting' | 'stopped' }
    | { type: 'ready' | 'running', server: ChildProcess, capabilities: string[], encoding: string };

export interface CommandResults {
    resultCode: number;
    outputChunks: string[];
    errorChunks: string[];
}

/*
 * An HGCommandServer spawns the hg command server and handles communication between it and node.
 * Start the server with the `start` method, then use `runCommand` to run Mercurial commands.
 * Once stopped, the HGCommandServer should not be started again. Instead, instantiate a new instance and call `start`.
 */
export class HgCommandServer {
    private _state: ServerState = { type: 'initial' };

    /*
     * Parse the capabilities and encoding when the cmd server starts up
     */
    public static parseCapabilitiesAndEncoding(chunk: OutputChunk): HelloMessage {
        if (chunk.channel !== 'o') {
            throw new Error('Invalid server hello message: expected message on the "o" channel');
        }
        const fields: { capabilities?: string, encoding?: string } = {};
        chunk.body.split('\n').forEach(line => {
            const split = line.split(': ', 2);
            if (split.length === 2) {
                switch (split[0]) {
                    case 'capabilities':
                        fields.capabilities = split[1];
                        break;
                    case 'encoding':
                        fields.encoding = split[1];
                        break;
                }
            }
        });
        if (!fields.capabilities || !fields.encoding) {
            throw new Error(`Invalid server hello message: ${chunk.body}`);
        }
        const capabilities = fields.capabilities.split(' ');
        const encoding = fields.encoding;
        return {
            capabilities: capabilities,
            encoding: encoding
        };
    }

    /**
     * Parse a chunk from a channel from the given buffer. Returns the size in bytes consumed from the buffer.
     */
    public static parseOutputChunk(data: Buffer, start: number, encoding: string): { chunk: OutputChunk, size: number } {
        const channel = String.fromCharCode(data.readUInt8(start));
        const length = data.readUInt32BE(start + 1);

        if (channel === 'I' || channel === 'L') {
            // Messages requesting input do not have a body
            return { chunk: { channel, length }, size: 5 };
        } else if (channel === 'e' || channel === 'o' || channel === 'r') {
            const bodyBegin = start + 5;
            const bodyData = data.slice(bodyBegin, bodyBegin + length);
            const size = 5 + length;

            if (channel === 'r') {
                return { chunk: { channel, body: bodyData.readInt32BE(0) }, size };
            } else {
                return { chunk: { channel, body: bodyData.toString(encoding) }, size };
            }
        } else {
            throw new Error(`Unexpected channel ${channel}`);
        }
    }

    public get state(): 'initial' | 'starting' | 'stopped' | 'ready' | 'running' {
        return this._state.type;
    }

    /*
     * Start the command server at a specified directory (path must already be an hg repository).
     * Returned promise is resolved when the server has started and is ready to run commands.
     */
    public async start(startCommandServer: (path: string) => Promise<ChildProcess>, path: string): Promise<void> {
        if (this._state.type !== 'initial') {
            throw new Error('Server has already been started');
        }

        this._state = { type: 'starting' };

        const serverProcess = await startCommandServer(path);
        let helloMessage: HelloMessage;

        try {
            helloMessage = await this.waitForHello(serverProcess);
        } catch (e) {
            this._state = { type: 'stopped' };
            throw e;
        }

        this._state = { type: 'ready', server: serverProcess, ...helloMessage };

        serverProcess.on('exit', () => {
            this._state = { type: 'stopped' };
        });
    }

    /*
     * Stop the current command server process from running.
     */
    public stop(): void {
        if (this._state.type === 'running' || this._state.type === 'ready') {
            this._state.server.stdout.removeAllListeners('data');
            this._state.server.stdout.removeAllListeners('data');
            this._state.server.stdin.end();
            this._state = { type: 'stopped' };
        }
    }

    /**
     * Run a Mercurial command using the command server.
     * The promise is rejected if there is an error running the command (e.g. the command server process terminates).
     * Otherwise, the promise is resolved with the result of the command. Note: the command could have returned a non-zero
     * exit code.
     */
    public runCommand(args: string[], outputCallback?: (chunk: string) => void, responseProvider?: (promptKey: string) => Promise<string>): Promise<CommandResults> {
        if (this._state.type !== 'ready') {
            return Promise.reject(new Error('Mercurial command server is not ready'));
        }

        const { server, encoding } = this._state;
        this._state = { ...this._state, type: 'running' };

        return new Promise(((resolve, reject) => {
            const errorChunks: string[] = [];
            const outputChunks: string[] = [];

            const dataListener = (data: Buffer) => {
                const chunks: OutputChunk[] = [];
                let currBuffPos = 0;

                // Parse messages from stdout
                while (currBuffPos < data.length) {
                    try {
                        const { chunk, size } = HgCommandServer.parseOutputChunk(data, currBuffPos, encoding);
                        chunks.push(chunk);
                        currBuffPos += size;
                    } catch (e) {
                        reject(e);
                        return;
                    }
                }

                let previousLine = '';
                for (const chunk of chunks) {
                    if (chunk.channel === 'e') {
                        errorChunks.push(chunk.body);
                        if (chunk.body.trim() !== '') {
                            previousLine = chunk.body.trim();
                        }
                    } else if (chunk.channel === 'o') {
                        outputChunks.push(chunk.body);
                        if (chunk.body.trim() !== '') {
                            previousLine = chunk.body.trim();
                        }

                        if (outputCallback) {
                            outputCallback(chunk.body);
                        }
                    } else if (chunk.channel === 'r') {
                        // Command is complete
                        resolve({ resultCode: chunk.body, outputChunks, errorChunks });
                        cleanupListeners();

                        // Guard to prevent marking a "stopped" server as "ready"
                        if (this._state.type === 'running') {
                            this._state = { ...this._state, type: 'ready' };
                        }

                        return;
                    } else if (chunk.channel === 'I' || chunk.channel === 'L') {
                        if (!responseProvider) {
                            reject(`command "hg ${args.join(' ')}" is prompting for input "${previousLine}".  Input prompts from this command are not expected.`);
                            return;
                        }
                        if (previousLine.endsWith(':')) {
                            const promptKey = previousLine.slice(0, previousLine.length - 1);
                            responseProvider(promptKey)
                                .then(value => this.serverSendLineInput(server, 'utf-8', value))
                                .catch(error => reject(`command "hg ${args.join(' ')}" is prompting for input.  ${error.message}`));
                        } else {
                            reject('prompt for input but previous line does not end with ":". The previous line is: ' + previousLine);
                            return;
                        }
                    }
                }
            };

            const exitListener = () => {
                cleanupListeners();
                reject(new Error('Server exited unexpectedly'));
            };

            const cleanupListeners = () => {
                server.stdout.removeListener('data', dataListener);
                server.removeListener('exit', exitListener);
            };

            server.stdout.on('data', dataListener);
            server.on('exit', exitListener);

            this.serverSend(server, encoding, 'runcommand', args).catch(e => {
                cleanupListeners();
                if (this._state.type === 'running') {
                    this._state = { ...this._state, type: 'ready' };
                }
                reject(e);
            });
        }));
    }

    /**
     * Wait for the hello message from a spawned command server process.
     * The returned promise resolves when the hello message is received from the server's stdout pipe.
     * After this resolves, this method makes sure that there are no listeners still attached to the server or its stdio streams.
     */
    private waitForHello(server: ChildProcess): Promise<HelloMessage> {
        return new Promise(((resolve, reject) => {
            const stderr: string[] = [];

            const initialStderrListener = (chunk: Buffer) => {
                stderr.push(chunk.toString('UTF-8'));
            };

            const initialErrorListener = (err: Error) => {
                cleanupInitialListeners();
                reject(err);
            };

            const initialExitListener = () => {
                cleanupInitialListeners();
                // The messages from the Python scripts can often contain stack traces.
                // These are too long to show in a popup, so extract the last line
                const messageFromProcess = stderr.join('\n').trim().split('\n').pop();
                // const message = `Unable to execute Mercurial command at ${ToolsPath.getHgServer()}: ${messageFromProcess ? messageFromProcess : 'Server closed unexpectedly'}`;
                const message = `Unable to execute Mercurial command at ${'/usr/bin/hg'}: ${messageFromProcess ? messageFromProcess : 'Server closed unexpectedly'}`;

                // We don't expect the server to exit before we ask it to
                reject(new Error(message));
            };

            const initialDataListener = (data: Buffer) => {
                cleanupInitialListeners();

                try {
                    // Choose UTF-8 to parse the hello message - the message will tell us what to use for subsequent messages
                    const { chunk } = HgCommandServer.parseOutputChunk(data, 0, 'UTF-8');
                    const ref = HgCommandServer.parseCapabilitiesAndEncoding(chunk);

                    // Now the server is running and ready to receive commands
                    resolve(ref);
                } catch (e) {
                    reject(e);
                }
            };

            const cleanupInitialListeners = () => {
                server.removeListener('error', initialErrorListener);
                server.removeListener('exit', initialExitListener);
                server.stdout.removeListener('data', initialDataListener);
                server.stderr.removeListener('data', initialStderrListener);
            };

            // Emitted when the process could not be spawned (or killed)
            server.on('error', initialErrorListener);

            // Emitted when the server process exits
            server.on('exit', initialExitListener);

            // The first message received after starting the server contains the capabilities and character encoding
            server.stdout.once('data', initialDataListener);
        }));
    }

    /*
     * Send the raw command strings to the cmdserver over `stdin`
     */
    private async serverSend(server: ChildProcess, encoding: string, cmd: string, args: string[]): Promise<void> {
        const cmdLength = cmd.length + 1;
        const argParts = args.join('\0');
        const argLength = argParts.length;
        const argLengthSize = 4;
        const totalBufferSize = cmdLength + argLengthSize + argLength;
        const outputBuffer = Buffer.alloc(totalBufferSize);
        outputBuffer.write(cmd + '\n', undefined, undefined, encoding);
        outputBuffer.writeUInt32BE(argLength, cmdLength);
        outputBuffer.write(argParts, cmdLength + argLengthSize, undefined, encoding);

        const stdinWrite = promisify(server.stdin.write.bind(server.stdin));
        await stdinWrite(outputBuffer);
    }

    /*
     * Send the raw response strings to the cmdserver over `stdin`
     */
    async serverSendLineInput(server: ChildProcess, encoding: string, text: string): Promise<void> {
        const textLength = text.length + 1;
        const totalBufferSize = textLength + 4;
        const outputBuffer = Buffer.alloc(totalBufferSize);
        outputBuffer.writeUInt32BE(textLength, 0);
        outputBuffer.write(`${text}\n`, 4, textLength, 'ascii');
        const stdinWrite = promisify(server.stdin.write.bind(server.stdin));
        await stdinWrite(outputBuffer);
    }

}
