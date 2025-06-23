// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
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

import * as yargs from 'yargs';
import { injectable } from 'inversify';
import { LogLevel } from '../common/logger';
import { CliContribution } from './cli';
import * as fs from 'fs-extra';
import { subscribe } from '@parcel/watcher';
import { Event, Emitter } from '../common/event';
import * as path from 'path';

/** Maps logger names to log levels.  */
export interface LogLevels {
    [key: string]: LogLevel,
}

/**
 * Parses command line switches related to log levels, then watches the log
 * levels file (if specified) for changes.  This is the source of truth for
 * what the log level per logger should be.
 */
@injectable()
export class LogLevelCliContribution implements CliContribution {

    protected _logLevels: LogLevels = {};

    /**
     * Log level to use for loggers not specified in `logLevels`.
     */
    protected _defaultLogLevel: LogLevel = LogLevel.INFO;

    protected _logFile?: string;

    protected logConfigChangedEvent: Emitter<void> = new Emitter<void>();

    get defaultLogLevel(): LogLevel {
        return this._defaultLogLevel;
    }

    get logLevels(): LogLevels {
        return this._logLevels;
    }

    get logFile(): string | undefined {
        return this._logFile;
    }

    configure(conf: yargs.Argv): void {
        conf.option('log-level', {
            description: 'Sets the default log level',
            choices: Array.from(LogLevel.strings.values()),
            nargs: 1,
        });

        conf.option('log-config', {
            description: 'Path to the JSON file specifying the configuration of various loggers',
            type: 'string',
            nargs: 1,
        });

        conf.option('log-file', {
            description: 'Path to the log file',
            type: 'string',
            nargs: 1
        });
    }

    async setArguments(args: yargs.Arguments): Promise<void> {
        if (args['log-level'] !== undefined && args['log-config'] !== undefined) {
            throw new Error('--log-level and --log-config are mutually exclusive.');
        }

        if (args['log-level'] !== undefined) {
            this._defaultLogLevel = this.readLogLevelString(args['log-level'] as string, 'Unknown log level passed to --log-level');
        }

        if (args['log-config'] !== undefined) {
            let filename: string = args['log-config'] as string;
            try {
                filename = path.resolve(filename);

                await this.slurpLogConfigFile(filename);
                await this.watchLogConfigFile(filename);
            } catch (e) {
                console.error(`Error reading log config file ${filename}: ${e}`);
            }
        }

        if (args['log-file'] !== undefined) {
            let filename = args['log-file'] as string;
            try {
                filename = path.resolve(filename);
                try {
                    const stat = await fs.stat(filename);
                    if (stat && stat.isFile()) {
                        // Rename the previous log file to avoid overwriting it
                        const oldFilename = `${filename}.${stat.ctime.toISOString().replace(/:/g, '-')}.old`;
                        await fs.rename(filename, oldFilename);
                    }
                } catch {
                    // File does not exist, just continue to create it
                }
                await fs.writeFile(filename, '');
                this._logFile = filename;
            } catch (e) {
                console.error(`Error creating log file ${filename}: ${e}`);
            }
        }

        // some initial loggers have already been constructed. Fire the event to notify them.
        if (args['log-level'] || args['log-config'] || args['log-file']) {
            this.logConfigChangedEvent.fire();
        }
    }

    protected async watchLogConfigFile(filename: string): Promise<void> {
        const dir = path.dirname(filename);
        await subscribe(dir, async (err, events) => {
            if (err) {
                console.log(`Error during log file watching ${filename}: ${err}`);
                return;
            }
            try {
                for (const event of events) {
                    if (event.path === filename) {
                        switch (event.type) {
                            case 'create':
                            case 'update':
                                await this.slurpLogConfigFile(filename);
                                this.logConfigChangedEvent.fire(undefined);
                                break;
                        }
                    }
                }
            } catch (e) {
                console.error(`Error reading log config file ${filename}: ${e}`);
            }
        });
    }

    protected async slurpLogConfigFile(filename: string): Promise<void> {
        try {
            const content = await fs.readFile(filename, 'utf-8');
            const data = JSON.parse(content);

            let newDefaultLogLevel: LogLevel = LogLevel.INFO;

            if ('defaultLevel' in data) {
                newDefaultLogLevel = this.readLogLevelString(data['defaultLevel'], `Unknown default log level in ${filename}`);
            }

            const newLogLevels: { [key: string]: LogLevel } = {};

            if ('levels' in data) {
                const loggers = data['levels'];
                for (const logger of Object.keys(loggers)) {
                    const levelStr = loggers[logger];
                    newLogLevels[logger] = this.readLogLevelString(levelStr, `Unknown log level for logger ${logger} in ${filename}`);
                }
            }

            this._defaultLogLevel = newDefaultLogLevel;
            this._logLevels = newLogLevels;

            console.log(`Successfully read new log config from ${filename}.`);
        } catch (e) {
            throw new Error(`Error reading log config file ${filename}: ${e.message}`);
        }
    }

    get onLogConfigChanged(): Event<void> {
        return this.logConfigChangedEvent.event;
    }

    logLevelFor(loggerName: string): LogLevel {
        const level = this._logLevels[loggerName];

        if (level !== undefined) {
            return level;
        } else {
            return this.defaultLogLevel;
        }
    }

    /**
     * Converts the string to a `LogLevel`. Throws an error if invalid.
     */
    protected readLogLevelString(levelStr: string, errMessagePrefix: string): LogLevel {
        const level = LogLevel.fromString(levelStr);

        if (level === undefined) {
            throw new Error(`${errMessagePrefix}: "${levelStr}".`);
        }

        return level;
    }
}
