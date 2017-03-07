import {Readable, Writable} from "stream";

export class ReadableStream extends Readable {

    constructor(data: any) {
        super();
        this.push(data)
        this.push(null)
    }

    _read(size: number): void {
        // do nothing
    }

}

export class WritableStream extends Writable {

    data = new Buffer('')

    _write(data: any, encoding: string, callback: Function): void {
        const buffer = this.toBuffer(data, encoding);
        this.data = Buffer.concat([this.data, buffer])
        callback()
    }

    protected toBuffer(data: any, encoding: string): Buffer {
        if (Buffer.isBuffer(data)) {
            return data;
        }
        return new Buffer(data, encoding)
    }

}
