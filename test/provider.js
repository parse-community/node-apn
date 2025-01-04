const sinon = require('sinon');
const EventEmitter = require('events');

describe('Provider', function () {
  let fakes, Provider;

  beforeEach(function () {
    fakes = {
      Client: sinon.stub(),
      client: new EventEmitter(),
    };

    fakes.Client.returns(fakes.client);
    fakes.client.write = sinon.stub();
    fakes.client.shutdown = sinon.stub();

    Provider = require('../lib/provider')(fakes);
  });

  describe('constructor', function () {
    context('called without `new`', function () {
      it('returns a new instance', function () {
        expect(Provider()).to.be.an.instanceof(Provider);
      });
    });

    describe('Client instance', function () {
      it('is created', function () {
        Provider();

        expect(fakes.Client).to.be.calledOnce;
        expect(fakes.Client).to.be.calledWithNew;
      });

      it('is passed the options', function () {
        const options = { configKey: 'configValue' };

        Provider(options);
        expect(fakes.Client).to.be.calledWith(options);
      });
    });
  });

  describe('send', async () => {
    describe('single notification behaviour', async () => {
      let provider;

      context('transmission succeeds', async () => {
        beforeEach(async () => {
          provider = new Provider({ address: 'testapi' });

          fakes.client.write.onCall(0).returns(Promise.resolve({ device: 'abcd1234' }));
        });

        it('invokes the writer with correct `this`', async () => {
          await provider.send(notificationDouble(), 'abcd1234');
          
          expect(fakes.client.write).to.be.calledOn(fakes.client);
        });

        it('writes the notification to the client once', async () => {
          await provider.send(notificationDouble(), 'abcd1234');
          
          const notification = notificationDouble();
          const builtNotification = {
            headers: notification.headers(),
            body: notification.compile(),
          };
          const device = 'abcd1234';
          expect(fakes.client.write).to.be.calledOnce;
          expect(fakes.client.write).to.be.calledWith(
            builtNotification,
            device,
            'device',
            'post'
          );
        });

        it('does not pass the array index to writer', async () => {
          await provider.send(notificationDouble(), 'abcd1234');
          
          expect(fakes.client.write.firstCall.args[4]).to.be.undefined;
        });

        it('resolves with the device token in the sent array', async () => {
          const result = await provider.send(notificationDouble(), 'abcd1234');
          
          expect(result).to.deep.equal({
            sent: [{ device: 'abcd1234' }],
            failed: [],
          });
        });
      });

      context('error occurs', async () => {

        it('resolves with the device token, status code and response in the failed array', async () => {
          const provider = new Provider({ address: 'testapi' });

          fakes.client.write.onCall(0).returns(
            Promise.resolve({
              device: 'abcd1234',
              status: '400',
              response: { reason: 'BadDeviceToken' },
            })
          );
          const result = await provider.send(notificationDouble(), 'abcd1234');
  
          expect(result).to.deep.equal({
            sent: [],
            failed: [{ device: 'abcd1234', status: '400', response: { reason: 'BadDeviceToken' } }],
          });
        });
      });
    });

    context('when multiple tokens are passed', async () => {
      beforeEach(async () => {
        fakes.resolutions = [
          { device: 'abcd1234' },
          { device: 'adfe5969', status: '400', response: { reason: 'MissingTopic' } },
          {
            device: 'abcd1335',
            status: '410',
            response: { reason: 'BadDeviceToken', timestamp: 123456789 },
          },
          { device: 'bcfe4433' },
          { device: 'aabbc788', status: '413', response: { reason: 'PayloadTooLarge' } },
          { device: 'fbcde238', error: new Error('connection failed') },
        ];
      });

      context('streams are always returned', async () => {
        let response;

        beforeEach(async () => {
          const provider = new Provider({ address: 'testapi' });

          for (let i = 0; i < fakes.resolutions.length; i++) {
            fakes.client.write.onCall(i).returns(Promise.resolve(fakes.resolutions[i]));
          }

          response = await provider.send(
            notificationDouble(),
            fakes.resolutions.map(res => res.device)
          );
        });

        it('resolves with the sent notifications', async () => {
          expect(response.sent).to.deep.equal([{ device: 'abcd1234' }, { device: 'bcfe4433' }]);
        });

        it('resolves with the device token, status code and response or error of the unsent notifications', async () => {
          expect(response.failed[3].error).to.be.an.instanceof(Error);
            response.failed[3].error = { message: response.failed[3].error.message };
            expect(response.failed).to.deep.equal(
              [
                { device: 'adfe5969', status: '400', response: { reason: 'MissingTopic' } },
                {
                  device: 'abcd1335',
                  status: '410',
                  response: { reason: 'BadDeviceToken', timestamp: 123456789 },
                },
                { device: 'aabbc788', status: '413', response: { reason: 'PayloadTooLarge' } },
                { device: 'fbcde238', error: { message: 'connection failed' } },
              ],
              `Unexpected result: ${JSON.stringify(response.failed)}`
            );
        });
      });
    });
  });

  describe('shutdown', function () {
    it('invokes shutdown on the client', async () => {
      const callback = sinon.spy();
      const provider = new Provider({});
      provider.shutdown(callback);

      expect(fakes.client.shutdown).to.be.calledOnceWithExactly(callback);
    });
  });
});

function notificationDouble() {
  return {
    headers: sinon.stub().returns({}),
    payload: { aps: { badge: 1 } },
    compile: function () {
      return JSON.stringify(this.payload);
    },
  };
}
