import "mocha";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import { ConsoleLogger } from '../node/logger';
import { JsonRpcProxyFactory } from './proxy-factory';
import { createMessageConnection } from "vscode-jsonrpc/lib/main";
import * as stream from "stream";

const expect = chai.expect;

before(() => {
    chai.config.showDiff = true;
    chai.config.includeStack = true;
    chai.should();
    chai.use(chaiAsPromised);
});

beforeEach(() => {
});

class NoTransform extends stream.Transform {
    public _transform(chunk: any, encoding: string, callback: Function): void {
        callback(undefined, chunk)
    }
}

class TestServer {
    requests: string[] = []
    doStuff(arg: string): Promise<string> {
        this.requests.push(arg)
        return Promise.resolve(`done: ${arg}`)
    }
}

class TestClient {
    notifications: string[] = []
    notifyThat(arg: string): void {
        this.notifications.push(arg)
    }
}

describe('Proxy-Factory', () => {
    it('Should correctly send notifications and requests.', done => {
        let client = new TestClient()
        let server = new TestServer()

        let serverProxyFactory = new JsonRpcProxyFactory<TestServer>("/test", client)
        let client2server = new NoTransform()
        let server2client = new NoTransform()
        let serverConnection = createMessageConnection(server2client, client2server, new ConsoleLogger())
        serverProxyFactory.onConnection(serverConnection)
        let serverProxy = serverProxyFactory.createProxy()

        let clientProxyFactory = new JsonRpcProxyFactory<TestClient>("/test", server)
        let clientConnection = createMessageConnection(client2server, server2client, new ConsoleLogger())
        clientProxyFactory.onConnection(clientConnection)
        let clientProxy = clientProxyFactory.createProxy()
        clientProxy.notifyThat("hello")
        function check() {
            if (client.notifications.length === 0) {
                console.log("waiting another 50 ms")
                setTimeout(check, 50)
            } else {
                expect(client.notifications[0]).eq("hello")
                serverProxy.doStuff("foo").then( result => {
                    expect(result).to.be.eq("done: foo")
                    done()
                })
            }
        }
        check()

    });
});