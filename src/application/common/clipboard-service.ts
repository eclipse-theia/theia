import { injectable } from "inversify";

@injectable()
export class ClipboardSerivce {
    private data: string
    private hasData: boolean = false

    get getData(): any {
        if (this.hasData) {
            let parsed;
            try {
                parsed = JSON.parse(this.data)
            } catch (e) {}
            return parsed
        } else {
            return ""
        }
    }

    get isEmpty(): boolean {
        return !this.hasData
    }

    setData(data: any) {
        try {
            this.data = JSON.stringify(data)
        } catch (e) {}
        this.hasData = true
    }
}