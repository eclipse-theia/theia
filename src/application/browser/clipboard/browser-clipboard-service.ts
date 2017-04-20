import { injectable } from "inversify";

import { ClipboardService } from "../../common/clipboard-service";

@injectable()
export class BrowserClipboardService implements ClipboardService {
    private _data: any

    getData(format: string): any {
        if (this._data && this._data[format]) {
            return this._data[format];
        }
        return "";
    }

    get isEmpty(): boolean {
        return (typeof this._data === "undefined")
    }

    setData(data: any) {
        let format = Object.getOwnPropertyNames(data)[0]
        if (typeof this._data === 'undefined') {
            this._data = {}
        }
        this._data[format] = data[format]
    }
}