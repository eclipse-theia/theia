/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
export declare namespace MIProtocol {
    interface Output {
        outOfBandRecord?: OutOfBandRecord[];
        resultRecord?: ResultRecord;
    }

    interface OutputMessage {
        type: string;
    }

    type ResultClass = "done" | "running" | "connected" | "error" | "exit";
    type Results = [[string, string | any[]]];

    interface ResultRecord extends OutputMessage {
        token?: number;
        resultClass: ResultClass;
        properties: Results;
    }

    interface ErrorResultRecord extends OutputMessage {
        token?: number;
        resultClass: "error";
        msg?: string;
        code?: string;
    }

    interface OutOfBandRecord extends OutputMessage {
    }

    interface AsyncRecord extends OutOfBandRecord, AsyncOutput {
        token?: number;
    }

    interface ExecAsyncOutput extends AsyncRecord {
    }

    interface StatusAsyncOutput extends AsyncRecord {
    }

    interface NotifyAsyncOutput extends AsyncRecord {
    }

    interface AsyncOutput {
        asyncClass: string;
        /* Array of variable = Result */
        properties: Results;

    }

    interface StreamRecord extends OutputMessage {
    }

    interface ConsoleStreamOutput extends StreamRecord {
        output: string;
    }

    interface TargetStreamOutput extends StreamRecord {
        output: string;
    }

    interface LogStreamOutput extends StreamRecord {
        output: string;
    }

}

export namespace MIProtocol {

    export class MICommand {

        private options: [string, string][] = [];
        private parameters: string[] = [];
        private _token = 0;

        constructor(private operation: string, token?: number) {
            if (token !== undefined) {
                this.token = token;
            }
        }

        set token(token: number) {
            this._token = token;
        }

        get token(): number {
            return this._token;
        }

        pushOptionWithParameter(option: [string, string]) {
            this.options.push(option);
        }

        pushOption(option: string) {
            this.options.push([option, '']);
        }

        pushParameter(parameter: string) {
            this.parameters.push(parameter);
        }

        pushParameters(parameters: string[]) {
            this.parameters = this.parameters.concat(parameters);
        }

        toMI(): string {
            let message: string = ''
            if (this.token !== undefined) {
                message += this.token.toString();
            }

            message += '-';
            message += this.operation;

            this.options.forEach((option) => {
                message += ' ';
                message += '-';
                message += option[0];
                if (option[1] !== '') {
                    message += ' ';
                    message += option[1];
                }
            });

            if (this.options.length > 0 && this.parameters.length > 0) {
                message += ' --';
            }

            this.parameters.forEach((parameter) => {
                message += ' ';
                message += parameter;
            });

            message += '\n';
            return message;
        }
    }

    export class CLICommand {
        constructor(private command: string, private token?: number) {

        }

        toMI(): string {
            let message = "";

            if (this.token !== undefined) {
                message += this.token.toString();
            }

            message += this.command;
            message += '\n';

            return message;
        }
    }
}
