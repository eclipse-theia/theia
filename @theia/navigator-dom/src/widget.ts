import {TreeWidget} from "./tree/widget";
import {FileNavigatorModel} from "./model";

export class FileNavigator extends TreeWidget<FileNavigatorModel> {

    static readonly ID = 'file-navigator';

    constructor(model: FileNavigatorModel) {
        super(model);
        this.id = FileNavigator.ID;
        this.title.label = 'Files';
    }

    getModel(): FileNavigatorModel {
        return super.getModel()!;
    }

}
