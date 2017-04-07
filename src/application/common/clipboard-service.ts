import { injectable } from "inversify";

@injectable()
export class ClipboardSerivce {
    private _data: any

    getData(): any {
        return this._data;
    }

    get isEmpty(): boolean {
        return (typeof this._data === "undefined")
    }

    setData(data: any) {
        this._data = data
    }
}