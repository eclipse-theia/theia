import * as Stream from "stream";
import * as Events from "events";

// note: copied/renamed from mi-spec-utils.ts
// these can be useful for probably other components.
// make them available as part of some global test utils?

export namespace BuildUtils {

    /* FIXME merge common code with debug-test-utils */
    export function waitForNamedEvent(eventHandler: Events.EventEmitter, name: string) {
        return new Promise((resolve, reject) => {
            // tslint:disable-next-line:no-any
            eventHandler.on(name, (obj: any) => {
                resolve(obj);
            });
        });
    }

    export function waitForNamedEventCount(eventHandler: Events.EventEmitter, name: string, count: number) {
        let hits: number = 0;
        const events: Object[] = [];

        return new Promise((resolve, reject) => {
            // tslint:disable-next-line:no-any
            eventHandler.on(name, (obj: any) => {
                hits++;
                events.push(obj);
                if (hits === count) {
                    resolve(events);
                }
            });
        });
    }

    /** Captures build output and returns it once build done */
    export function waitForBuildLogDone(eventHandler: Events.EventEmitter) {
        let buff: String = '';

        return new Promise<String>((resolve, reject) => {
            eventHandler.on('build-output', (str: String) => {
                buff += str.toString();
            });
            eventHandler.on('build-done', () => {
                // console.log(buff)
                resolve(buff);
            });
        });
    }

    export function startWithInput(str: string,
        start: (inStream: Stream.Readable, outStream: Stream.PassThrough) => void): void {

        /* Setup in out stream for start */
        const inStream = new Stream.Readable;
        const outStream = new Stream.PassThrough();

        inStream.push(str);
        inStream.push(undefined);

        start(inStream, outStream);
    }

}
