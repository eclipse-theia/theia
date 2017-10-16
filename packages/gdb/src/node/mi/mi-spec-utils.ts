/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import * as stream from 'stream';
import * as events from 'events';

export namespace MIUtils {

    /* FIXME merge common code with debug-test-utils */
    export function waitForNamedEvent(eventHandler: events.EventEmitter, name: string) {
        return new Promise((resolve, reject) => {
            eventHandler.on(name, (obj: any) => {
                resolve(obj);
            });
        });
    }

    export function waitForNamedEventCount(eventHandler: events.EventEmitter, name: string, count: number) {
        let hits: number = 0;
        const events: Object[] = [];

        return new Promise((resolve, reject) => {
            eventHandler.on(name, (obj: any) => {
                hits++;
                events.push(obj);
                if (hits === count) {
                    resolve(events);
                }
            });
        });
    }

    export function startWithInput(str: string,
        start: (inStream: stream.Readable, outStream: stream.PassThrough) => void): void {

        /* Setup in out stream for start */
        const inStream = new stream.Readable;
        const outStream = new stream.PassThrough();

        inStream.push(str);
        inStream.push(null);

        start(inStream, outStream);
    }
}
