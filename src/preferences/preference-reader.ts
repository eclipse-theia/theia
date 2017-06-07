import URI from "../application/common/uri";
import * as os from "os";
import * as fs from "fs-extra";

const root: URI = new URI(`file://${os.tmpdir()}/node-fs-root`);

export class PreferenceReader {
    constructor() {
        const uri = root.appendPath("config.json");
        if (!fs.exists(uri.path)) {
            fs.createFile(uri.path.toString());
        }
    }

}