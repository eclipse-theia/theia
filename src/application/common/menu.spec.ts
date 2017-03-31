import { CommandContribution, CommandRegistry } from './command';
import { CompositeMenuNode, MenuContribution, MenuModelRegistry } from './menu';
import "mocha";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";

const expect = chai.expect;

before(() => {
    chai.config.showDiff = true;
    chai.config.includeStack = true;
    chai.should();
    chai.use(chaiAsPromised);
});

beforeEach(() => {
});

describe('menu-model-registry', () => {

    describe('01 #register', () => {
        it('Should allow to register menu actions.', () => {
            let service = createMenuRegistry({
                contribute(menuRegistry: MenuModelRegistry): void {
                    menuRegistry.registerSubmenu(["main"], "File", "File");
                    menuRegistry.registerMenuAction(["main", "File", "0_open"], {
                        commandId: 'open'
                    });
                    menuRegistry.registerMenuAction(["main", "File", "0_open"], {
                        commandId: 'open.with'
                    });
                }
            }, {
                contribute(reg: CommandRegistry) {
                    reg.registerCommand({
                        id : 'open',
                        label : "A"
                    });
                    reg.registerCommand({
                        id : 'open.with',
                        label : "B"
                    });
                }
            });
            let all = service.getMenu();
            let main = all.subMenus[0] as CompositeMenuNode;
            expect(main.subMenus.length).equals(1);
            expect(main.id, "main");
            expect(all.subMenus.length).equals(1);
            let file = main.subMenus[0] as CompositeMenuNode;
            expect(file.subMenus.length).equals(1);
            expect(file.label, "File");
            let openGroup = file.subMenus[0] as CompositeMenuNode;
            expect(openGroup.subMenus.length).equals(2);
            expect(openGroup.label).undefined;
        });
    });
});

function createMenuRegistry(menuContrib: MenuContribution, commandContrib: CommandContribution) {
    return new MenuModelRegistry([menuContrib], new CommandRegistry([commandContrib]));
}
