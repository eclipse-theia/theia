import {TreeWidget} from "./tree/widget";
import {FileNavigatorModel} from "./model";

export const FILE_NAVIGATOR_CLASS = 'theia-FileNavigator';

export class FileNavigator extends TreeWidget<FileNavigatorModel> {

    static readonly ID = 'file-navigator';

    constructor(model: FileNavigatorModel) {
        super(model);
        this.addClass(FILE_NAVIGATOR_CLASS);
        this.id = FileNavigator.ID;
        this.title.label = 'Files';
    }

    getModel(): FileNavigatorModel {
        return super.getModel()!;
    }

}
