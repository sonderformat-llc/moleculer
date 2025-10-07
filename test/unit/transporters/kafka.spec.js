const ServiceBroker = require("../../../src/service-broker");
const Transit = require("../../../src/transit");
const P = require("../../../src/packets");
const C = require("../../../src/constants");

// Mock @platformatic/kafka before requiring it
const FakeKafkaAdmin = {
	close: jest.fn(() => Promise.resolve()),
	createTopics: jest.fn(() => Promise.resolve([]))
};

const FakeKafkaProducer = {
	close: jest.fn(() => Promise.resolve()),
	send: jest.fn(() => Promise.resolve())
};

let consumerStreamHandlers = {};
const FakeKafkaStream = {
	on: jest.fn((event, cb) => {
		consumerStreamHandlers[event] = cb;
	})
};

const FakeKafkaConsumer = {
	close: jest.fn(() => Promise.resolve()),
	consume: jest.fn(() => Promise.resolve(FakeKafkaStream))
};

const Producer = jest.fn(() => FakeKafkaProducer);
const Consumer = jest.fn(() => FakeKafkaConsumer);
const Admin = jest.fn(() => FakeKafkaAdmin);

jest.mock("@platformatic/kafka", () => ({
	Producer,
	Consumer,
	Admin
}));

const KafkaTransporter = require("../../../src/transporters/kafka");

describe("Test KafkaTransporter constructor", () => {
	it("check constructor", () => {
		let transporter = new KafkaTransporter();
		expect(transporter).toBeDefined();
		expect(transporter.opts).toEqual({
			clientId: "moleculer-kafka",
			bootstrapBrokers: null,
			producer: {},
			consumer: {},
			admin: {},
			publish: {},
			publishMessage: {
				partition: 0
			}
		});
		expect(transporter.connected).toBe(false);
		expect(transporter.producer).toBeNull();
		expect(transporter.consumer).toBeNull();
	});

	it("check constructor with string param", () => {
		let transporter = new KafkaTransporter("localhost:9092");
		expect(transporter.opts).toEqual({
			clientId: "moleculer-kafka",
			bootstrapBrokers: ["localhost:9092"],
			producer: {},
			consumer: {},
			admin: {},
			publish: {},
			publishMessage: {
				partition: 0
			}
		});
	});

	it("check constructor with options", () => {
		let opts = {
			bootstrapBrokers: ["localhost:9092"],
			publishMessage: {
				partition: 1
			}
		};
		let transporter = new KafkaTransporter(opts);
		expect(transporter.opts).toEqual({
			clientId: "moleculer-kafka",
			bootstrapBrokers: ["localhost:9092"],
			producer: {},
			consumer: {},
			admin: {},
			publish: {},
			publishMessage: {
				partition: 1
			}
		});
	});
});

describe("Test KafkaTransporter connect & disconnect", () => {
	let broker = new ServiceBroker({ logger: false });
	let transit = new Transit(broker);
	let msgHandler = jest.fn();
	let transporter;

	beforeEach(() => {
		transporter = new KafkaTransporter({
			bootstrapBrokers: ["localhost:9092"],
			producer: {
				extraProp: 7
			}
		});
		transporter.init(transit, msgHandler);
	});

	it("check connect", async () => {
		await transporter.connect();
		expect(transporter.producer).toBeDefined();
		expect(transporter.admin).toBeDefined();

		expect(Producer).toHaveBeenCalledTimes(1);
		expect(Producer).toHaveBeenCalledWith({
			clientId: "moleculer-kafka",
			bootstrapBrokers: ["localhost:9092"],
			extraProp: 7
		});

		expect(Admin).toHaveBeenCalledTimes(1);
		expect(Admin).toHaveBeenCalledWith({
			clientId: "moleculer-kafka",
			bootstrapBrokers: ["localhost:9092"]
		});
	});

	it("check connect - should broadcast error", async () => {
		broker.broadcastLocal = jest.fn();

		const origErr = new Error("Ups");
		transporter.onConnected = jest.fn(() => Promise.reject(origErr));
		try {
			await transporter.connect();
			expect(1).toBe(2);
		} catch (err) {
			expect(err).toBe(origErr);
			expect(transporter.producer).toBeDefined();

			expect(broker.broadcastLocal).toHaveBeenCalledTimes(1);
			expect(broker.broadcastLocal).toHaveBeenNthCalledWith(1, "$transporter.error", {
				error: origErr,
				module: "transporter",
				type: C.FAILED_PUBLISHER_ERROR
			});
		}
	});

	it("check onConnected after connect", () => {
		transporter.onConnected = jest.fn(() => Promise.resolve());
		let p = transporter.connect().then(() => {
			expect(transporter.onConnected).toHaveBeenCalledTimes(1);
			expect(transporter.onConnected).toHaveBeenCalledWith();
		});

		return p;
	});

	it("check disconnect", async () => {
		await transporter.connect();
		await transporter.makeSubscriptions([
			{ cmd: "REQ", nodeID: "node" },
			{ cmd: "RES", nodeID: "node" }
		]);
		await transporter.disconnect();

		expect(FakeKafkaAdmin.close).toHaveBeenCalledTimes(1);
		expect(FakeKafkaProducer.close).toHaveBeenCalledTimes(1);
		expect(FakeKafkaConsumer.close).toHaveBeenCalledTimes(1);
	});
});

describe("Test KafkaTransporter makeSubscriptions", () => {
	let transporter;
	let msgHandler;

	beforeEach(async () => {
		msgHandler = jest.fn();
		transporter = new KafkaTransporter({
			bootstrapBrokers: ["kafka-server:1234"],
			consumer: { extraProp: 5 }
		});
		transporter.init(
			new Transit(new ServiceBroker({ logger: false, namespace: "TEST", nodeID: "node-1" })),
			msgHandler
		);

		await transporter.connect();
		transporter.incomingMessage = jest.fn();

		transporter.admin.createTopics.mockClear();
	});

	it("check makeSubscriptions", async () => {
		Consumer.mockClear();
		FakeKafkaConsumer.consume.mockClear();

		await transporter.makeSubscriptions([
			{ cmd: "REQ", nodeID: "node" },
			{ cmd: "RES", nodeID: "node" }
		]);

		expect(transporter.admin.createTopics).toHaveBeenCalledTimes(1);
		expect(transporter.admin.createTopics).toHaveBeenCalledWith({
			topics: ["MOL-TEST.REQ.node", "MOL-TEST.RES.node"]
		});

		expect(Consumer).toHaveBeenCalledTimes(1);
		expect(Consumer).toHaveBeenCalledWith({
			clientId: "moleculer-kafka",
			bootstrapBrokers: ["kafka-server:1234"],
			groupId: transporter.broker.instanceID,
			extraProp: 5
		});

		expect(FakeKafkaConsumer.consume).toHaveBeenCalledTimes(1);
		expect(transporter.consumer).toBeDefined();

		consumerStreamHandlers.data({
			topic: "MOL.INFO.node-2",
			value: '{ ver: "3" }'
		});
		expect(transporter.incomingMessage).toHaveBeenCalledTimes(1);
		expect(transporter.incomingMessage).toHaveBeenCalledWith("INFO", '{ ver: "3" }');
	});

	it("check makeSubscriptions - should handle topic already exists error", async () => {
		transporter.broker.broadcastLocal = jest.fn();

		const topicExistsErr = new Error(
			"Received response with error while executing API CreateTopics(v7)"
		);
		topicExistsErr.code = "PLT_KFK_RESPONSE";
		topicExistsErr.message =
			"Received response with error while executing API CreateTopics(v7): Topic with this name already exists";
		transporter.admin.createTopics = jest.fn(() => Promise.reject(topicExistsErr));

		// Should not throw error when topics already exist
		await transporter.makeSubscriptions([
			{ cmd: "REQ", nodeID: "node" },
			{ cmd: "RES", nodeID: "node" }
		]);

		expect(transporter.broker.broadcastLocal).toHaveBeenCalledTimes(0);
		expect(transporter.consumer).toBeDefined();

		transporter.admin.createTopics = jest.fn(() => Promise.resolve([]));
	});

	it("check makeSubscriptions - should broadcast an error", async () => {
		transporter.broker.broadcastLocal = jest.fn();

		const origErr = new Error("Ups");
		transporter.admin.createTopics = jest.fn(() => Promise.reject(origErr));

		try {
			await transporter.makeSubscriptions([
				{ cmd: "REQ", nodeID: "node" },
				{ cmd: "RES", nodeID: "node" }
			]);
			expect(1).toBe(2);
		} catch (err) {
			expect(err).toBe(origErr);
			expect(transporter.producer).toBeDefined();

			expect(transporter.broker.broadcastLocal).toHaveBeenCalledTimes(1);
			expect(transporter.broker.broadcastLocal).toHaveBeenCalledWith("$transporter.error", {
				error: origErr,
				module: "transporter",
				type: C.FAILED_TOPIC_CREATION
			});
		}

		transporter.admin.createTopics = jest.fn(() => Promise.resolve([]));
	});

	it("check makeSubscriptions - should broadcast a consumer error", async () => {
		transporter.broker.broadcastLocal = jest.fn();

		const origErr = new Error("Ups");
		FakeKafkaConsumer.consume = jest.fn(() => {
			throw origErr;
		});

		try {
			await transporter.makeSubscriptions([
				{ cmd: "REQ", nodeID: "node" },
				{ cmd: "RES", nodeID: "node" }
			]);
			expect(1).toBe(2);
		} catch (err) {
			expect(err).toBe(origErr);
			expect(transporter.broker.broadcastLocal).toHaveBeenCalledTimes(1);
			expect(transporter.broker.broadcastLocal).toHaveBeenCalledWith("$transporter.error", {
				error: origErr,
				module: "transporter",
				type: C.FAILED_CONSUMER_ERROR
			});
		}

		FakeKafkaConsumer.consume = jest.fn(() => Promise.resolve(FakeKafkaStream));
	});
});

describe("Test KafkaTransporter subscribe & publish", () => {
	let transporter;
	let msgHandler;

	beforeEach(async () => {
		msgHandler = jest.fn();
		transporter = new KafkaTransporter({
			bootstrapBrokers: ["kafka-server:1234"],
			publish: { extraProp: 5 },
			publishMessage: { partition: 2 }
		});
		transporter.init(
			new Transit(new ServiceBroker({ logger: false, namespace: "TEST", nodeID: "node1" })),
			msgHandler
		);
		transporter.serialize = jest.fn(() => Buffer.from("json data"));

		await transporter.connect();
	});

	it("check publish", async () => {
		transporter.producer.send.mockClear();
		const packet = new P.Packet(P.PACKET_INFO, "node2", { services: {} });
		await transporter.publish(packet);

		expect(transporter.producer.send).toHaveBeenCalledTimes(1);
		expect(transporter.producer.send).toHaveBeenCalledWith({
			messages: [
				{
					topic: "MOL-TEST.INFO.node2",
					value: Buffer.from("json data"),
					partition: 2
				}
			],
			extraProp: 5
		});

		expect(transporter.serialize).toHaveBeenCalledTimes(1);
		expect(transporter.serialize).toHaveBeenCalledWith(packet);
	});

	it("check publish - should broadcast a publisher error", async () => {
		transporter.broker.broadcastLocal = jest.fn();

		const origErr = new Error("Ups");
		FakeKafkaProducer.send = jest.fn(() => {
			throw origErr;
		});

		try {
			const packet = new P.Packet(P.PACKET_INFO, "node2", { services: {} });
			await transporter.publish(packet);
			expect(1).toBe(2);
		} catch (err) {
			expect(err).toBe(origErr);
			expect(transporter.broker.broadcastLocal).toHaveBeenCalledTimes(1);
			expect(transporter.broker.broadcastLocal).toHaveBeenCalledWith("$transporter.error", {
				error: origErr,
				module: "transporter",
				type: C.FAILED_PUBLISHER_ERROR
			});
		}

		FakeKafkaProducer.send = jest.fn(() => Promise.resolve());
	});
});
