/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { decorate, injectable, inject } from 'inversify';
import * as events from 'events';
import { IMIParser } from './mi-parser';
import { MIProtocol as MI } from './mi-protocol';
import { ILogger } from '@theia/core/lib/common';

decorate(injectable(), events.EventEmitter);

@injectable()
export class MIInterpreter extends events.EventEmitter {
    protected data: Buffer;
    protected pendingRequests: Function[] = [];
    protected token: number = 0;
    protected outStream: NodeJS.WritableStream;

    constructor(
        @inject(IMIParser) public parser: IMIParser,
        @inject(ILogger) public readonly logger: ILogger) {
        super();
        this.data = Buffer.alloc(0);
    }

    start(inStream: NodeJS.ReadableStream, outStream: NodeJS.WritableStream) {
        inStream.on('data', (data: Buffer) => this.handleInput(data));
        this.outStream = outStream;
    }

    emitOutputEvents(output: MI.Output) {
        if (output.outOfBandRecord !== undefined) {
            output.outOfBandRecord.forEach((record, index, array) => {
                this.logger.debug(`MIInterpreter emit: ${record.type} ${JSON.stringify(record)} `);
                this.emit(record.type, record);
            });
        }

        if (output.resultRecord !== undefined && output.resultRecord.token !== undefined) {
            const token = output.resultRecord.token;
            this.logger.debug(`MIInterpreter: Got result record for token: ${token}`);
            if (token in this.pendingRequests) {
                this.logger.debug(`MIInterpreter: Executing resolve func`);
                this.pendingRequests[token](output.resultRecord);
                delete this.pendingRequests[token];
            }
        }
    }

    sendCommand(command: MI.MICommand): Promise<any> {
        command.token = this.token;

        /* FIXME reject because of timeout or error ? */
        const promise = new Promise((resolve, reject) => {
            this.pendingRequests[this.token] = resolve;
        });

        this.token++;
        this.sendRaw(command.toMI());

        return promise;
    }

    sendRaw(command: string) {
        this.outStream.write(command, 'utf8');
    }

    handleInput(data: Buffer): void {
        const encoding = 'utf8';
        const prompt = '(gdb)';
        this.data = Buffer.concat([this.data, data]);
        this.logger.debug(`Interpreter HANDLE INPUT: ${data.toString()} `);
        let promptStartOffset: number = this.data.indexOf(prompt, 0, encoding);
        // Handles (gdb) \r\n or (gdb) \n
        while (promptStartOffset >= 0) {
            const promptEndOffset = this.data.indexOf('\n', promptStartOffset, encoding);
            const promptLength = promptEndOffset - promptStartOffset + 1;
            const output: string = this.data.toString(encoding, 0, promptStartOffset + promptLength);
            this.data = this.data.slice(promptStartOffset + promptLength, this.data.length);
            try {
                this.logger.debug(`Sending to parser : ${output} `);
                const result: MI.Output = this.parser.parse(output);
                this.logger.debug(`MI parsed result: ${JSON.stringify(result)} `);
                this.emitOutputEvents(result)
            } catch (error) {
                this.logger.error(`Error parsing MI: ${error.message}`);
            }

            promptStartOffset = this.data.indexOf(prompt, 0, encoding);
        }
    }
}
