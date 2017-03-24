import { SelectionService } from './selection-service';
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

describe('selection-service', () => {

    describe('01 #addListener and dispose', () => {
        it('Should be rejected when path argument is undefined.', () => {
            let service = createSelectionService();
            let events: any[] = [];
            let disposable = service.addSelectionListener(
                e => events.push(e)
            );
            service.setSelection("foo");
            disposable.dispose();
            service.setSelection("bar");
            expect(events.length).equals(1);
            expect(events[0]).equals("foo");
        });
    });
});

function createSelectionService() {
    return new SelectionService();
}
