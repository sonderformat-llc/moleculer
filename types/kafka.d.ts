import type { GenericObject } from "../index";

export interface KafkaTransporterOptions {
	/**
	 * Client ID for all clients
	 * @default "moleculer-kafka"
	 */
	clientId?: string;

	/**
	 * Bootstrap brokers for connection
	 */
	bootstrapBrokers?: string[] | string;

	/**
	 * Producer options
	 */
	producer?: GenericObject;

	/**
	 * Consumer options
	 */
	consumer?: GenericObject;

	/**
	 * Admin options
	 */
	admin?: GenericObject;

	/**
	 * Publish options
	 */
	publish?: GenericObject;

	/**
	 * Message options for send
	 */
	publishMessage?: {
		partition?: number;
		[key: string]: any;
	};
}
