import {Widget} from "@phosphor/widgets";

export class FileNavigator extends Widget {

    static readonly ID = 'file-navigator';

    constructor() {
        super();
        this.id = FileNavigator.ID;
        this.title.label = 'Files';
    }

}
