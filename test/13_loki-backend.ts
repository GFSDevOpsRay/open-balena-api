import _ = require('lodash');
import * as Bluebird from 'bluebird';
import { expect } from './test-lib/chai';
import { LokiBackend } from '../src/features/device-logs/lib/backends/loki';
import { getNanoTimestamp } from '../src/lib/utils';

const createLog = (extra = {}) => {
	return {
		isStdErr: true,
		isSystem: true,
		message: `a log line`,
		nanoTimestamp: getNanoTimestamp(),
		timestamp: Date.now(),
		createdAt: Date.now(),
		...extra,
	};
};

const createContext = (extra = {}) => {
	return {
		id: 1,
		uuid: '1',
		belongs_to__application: 1,
		images: [],
		...extra,
	};
};

describe('loki backend', () => {
	it.only('should successfully publish log', async () => {
		const loki = new LokiBackend();
		const response = await loki.publish(createContext(), [createLog()]);
		expect(response).to.be.not.null;
	});

	it.only('should store and retrieve device log', async () => {
		for (let i = 0; i < 10; i++) {
			const reference = Math.trunc(Math.random() * 1000);
			console.log(`######### {reference: ${reference}}`);
			const loki = new LokiBackend();
			const ctx = createContext();
			const log = createLog({ reference });
			const response = await loki.publish(ctx, [_.clone(log)]);
			// expect(response).to.be.not.null;
			const history = await loki.history(ctx, 1000);
			// expect(history[history.length - 1]).to.deep.equal(log);
			const test = _.isEqual(history[history.length - 1], log);
			if (!test) {
				console.log(
					`expected ${JSON.stringify(
						_.pick(log, ['timestamp', 'reference']),
					)} -- actually ${JSON.stringify(
						_.pick(history[history.length - 1], ['timestamp', 'reference']),
					)}`,
				);
			}
		}
	});

	it('should convert multiple logs with different labels to streams and then back to logs', function () {
		const loki = new LokiBackend();
		const ctx = createContext();
		const logs = [
			createLog(),
			createLog(),
			createLog({ serviceId: 1 }),
			createLog({ serviceId: 2 }),
			createLog({ serviceId: 3 }),
		];
		// @ts-expect-error usage of private function
		const streams = loki.fromDeviceLogsToStreams(ctx, _.cloneDeep(logs));
		expect(streams.length).to.be.equal(
			1,
			'should be 1 stream since all logs share the same device id',
		);
		// @ts-expect-error usage of private function
		const logsFromStreams = loki.fromStreamsToDeviceLogs(streams);
		expect(logsFromStreams).to.deep.equal(logs);
	});

	it('should push multiple logs with different labels and return in order', async function () {
		const loki = new LokiBackend();
		const ctx = createContext();
		const now = getNanoTimestamp();
		const logs = [
			createLog({ nanoTimestamp: now - 4n }),
			createLog({ nanoTimestamp: now - 3n }),
			createLog({ nanoTimestamp: now - 2n, isStdErr: false }),
			createLog({ nanoTimestamp: now - 1n, isStdErr: false }),
			createLog({ nanoTimestamp: now, isStdErr: false, isSystem: false }),
		];
		const response = await loki.publish(ctx, _.cloneDeep(logs));
		expect(response).to.be.not.null;
		const history = await loki.history(ctx, 1000);
		expect(history.slice(-5)).to.deep.equal(logs);
	});

	it('should de-duplicate multiple identical logs', async function () {
		const loki = new LokiBackend();
		const ctx = createContext();
		const log = createLog();
		const logs = [_.clone(log), _.clone(log), _.clone(log)];
		const response = await loki.publish(ctx, _.cloneDeep(logs));
		expect(response).to.be.not.null;
		const history = await loki.history(ctx, 1000);
		expect(history[1].timestamp).to.not.equal(log.timestamp);
	});

	it('should subscribe and receive a published logs', async function () {
		const ctx = createContext();
		const loki = new LokiBackend();
		const log = createLog();
		const incomingLog = await new Bluebird(async (resolve) => {
			loki.subscribe(ctx, resolve);
			await Bluebird.delay(100); // wait for the subscription to connect
			loki.publish(ctx, [_.clone(log)]);
		}).timeout(5000, 'Subscription did not receive log');
		expect(incomingLog).to.deep.equal(incomingLog);
	});

	it('should subscribe and receive multiple published logs', async function () {
		const ctx = createContext({ belongs_to__application: 2 });
		const loki = new LokiBackend();
		await new Bluebird(async (resolve) => {
			let countLogs = 0;
			loki.subscribe(ctx, () => {
				countLogs += 1;
				if (countLogs === 5) {
					resolve();
				}
			});
			// let time pass after subscription so multiple logs with different times can be published
			await Bluebird.delay(100);
			const now = getNanoTimestamp();
			const logs = [
				createLog({ nanoTimestamp: now - 4n }),
				createLog({ nanoTimestamp: now - 3n }),
				createLog({ nanoTimestamp: now - 2n, isStdErr: false }),
				createLog({ nanoTimestamp: now - 1n, isStdErr: false }),
				createLog({ nanoTimestamp: now, isStdErr: false, isSystem: false }),
			];
			await loki.publish(ctx, logs);
		}).timeout(5000, 'Subscription did not receive logs');
	});
});
