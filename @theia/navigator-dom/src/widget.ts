import {TreeWidget} from "./tree/widget";
import {FileNavigatorModel} from "./model";
import {TheiaPlugin, TheiaApplication} from "@theia/shell-dom";
import {injectable, inject, decorate} from "inversify";

export const FILE_NAVIGATOR_CLASS = 'theia-FileNavigator';

decorate(injectable(), TreeWidget);

@injectable()
export class FileNavigator extends TreeWidget<FileNavigatorModel> {

    static readonly ID = 'file-navigator';

    constructor(@inject(FileNavigatorModel) model: FileNavigatorModel) {
        super(model);
        this.addClass(FILE_NAVIGATOR_CLASS);
        this.id = FileNavigator.ID;
        this.title.label = 'Files';
    }

    getModel(): FileNavigatorModel {
        return super.getModel()!;
    }

}

@injectable()
export class FileNavigatorContribution implements TheiaPlugin {

    constructor(@inject(FileNavigator) private fileNavigator: FileNavigator) {}

    onStart(app: TheiaApplication) : void {
        this.fileNavigator.getModel().refresh();
        app.shell.addToLeftArea(this.fileNavigator);
    }
}