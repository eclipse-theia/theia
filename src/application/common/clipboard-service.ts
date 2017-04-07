import { injectable } from "inversify";

@injectable()
export class ClipboardSerivce {
    private data: string | undefined

    get getData(): any {
        if (typeof this.data !== "undefined") {
            let parsed;
            try {
                parsed = JSON.parse(this.data)
            } catch (e) {
                throw Error(e)
            }
            return parsed
        } else {
            return ""
        }
    }

    get isEmpty(): boolean {
        return (typeof this.data === "undefined")
    }

    setData(data: any) {
        try {
            this.data = JSON.stringify(data)
        } catch (e) {
            throw Error(e)
        }
    }
}