import { DEFAULT_DLQ_MESSAGE_TTL, DEFAULT_QUEUE_FRAME_MAX_SIZE, DEFAULT_UNSPECIFIED_DLQ } from "../../constants/Queue.constants";
import { AsyncLock } from "../../../async-lock/AsyncLocks";
import { formatErrorRecursive } from "../../helpers/RecursiveErrorsFormatting.helper";
import { DefaultSagaRequestType, DefaultSagaResponseType } from "../../types/Saga.types";
import { SagaQueuesAdapter } from "../../types/SagaQueuesAdapter.types";
import amqp, { Connection as RabbitMQConnection, XDeath } from 'amqplib'

export interface RabbitMQCredentials extends amqp.Options.Connect {}

export class RabbitMQSagaQueuesAdapter 
implements SagaQueuesAdapter<RabbitMQCredentials> {

    private credentials?: RabbitMQCredentials;
    private rabbit_connecton?: RabbitMQConnection;
    private rabbit_connection_lock: AsyncLock;
    private disposed: boolean = false
    private channels: {[queue_name: string]: { channel: amqp.Channel, default_dlq?: string }}
    private channelLocks: {[queue_name: string]: AsyncLock}
    private consumerSubscriptions: {[consumerId: string]: {
        producer: () => Promise<{ channel: amqp.Channel, consumeResult: amqp.Replies.Consume }>,
        cancelled: boolean
    }}

    constructor(){
        this.rabbit_connection_lock = new AsyncLock()
        this.channels = {}
        this.channelLocks = {}
        this.consumerSubscriptions = {}
    }

    setupCredentials(credentials: RabbitMQCredentials): RabbitMQCredentials {
        
        this.credentials = credentials
        return credentials

    }

    //TODO: retries
    async connection(): Promise<void> {

        if(!this.credentials) throw new Error('Adapter requires credentials specified before establishing connection')
        if(this.disposed) throw new Error('Adapter connection disposed')

        await this.rabbit_connection_lock.acquire()

        if(!this.rabbit_connecton) {

            try {

                const connection = await amqp.connect({...this.credentials, frameMax: DEFAULT_QUEUE_FRAME_MAX_SIZE});

                connection.on('close', () => {

                    this.rabbit_connecton = undefined

                })

                connection.on('error', (error) => {

                    this.rabbit_connecton = undefined
                    throw error
                    
                })

                this.rabbit_connecton = connection

                await this.restoreChannels()
                await this.restoreConsumerHandlers()

            } catch(ex) {

                this.rabbit_connection_lock.release()
                throw ex

            }

        }
        
        this.rabbit_connection_lock.release()

    }

    async dispose(): Promise<void> {

        this.disposed = true

        if(this.rabbit_connecton) await this.rabbit_connecton.close()

    }

    private async setupChannel(queue_name: string, default_dlq?: string) {

        const lock = this.channelLocks[queue_name] || new AsyncLock()
        this.channelLocks[queue_name] = lock
        await lock.acquire()

        if(this.channels[queue_name]) {
            lock.release()
            return this.channels[queue_name].channel
        }

        const channel = await this.rabbit_connecton!.createChannel()
        await channel.assertQueue(queue_name, { durable: true, deadLetterExchange: default_dlq })

        if(default_dlq) await channel.assertExchange(default_dlq, 'direct', { durable: true })

        this.channels[queue_name] = { channel, default_dlq }

        lock.release()

        return channel

    }

    private async requestChannel(queue_name: string, default_dlq?: string) {

        if(!this.channels[queue_name]) return await this.setupChannel(queue_name, default_dlq)
        else return this.channels[queue_name].channel

    }

    private async restoreChannels() {

        for(let queue_name of Object.keys(this.channels)) {

            const { default_dlq } = this.channels[queue_name]
            delete this.channels[queue_name]
            await this.setupChannel(queue_name, default_dlq)

        }

    }

    private async restoreConsumerHandlers() {

        const consumerSubs = Object.keys(this.consumerSubscriptions)
            .map(consumerTag => this.consumerSubscriptions[consumerTag])

        this.consumerSubscriptions = {}

        await Promise.all(
            consumerSubs.map(async ({ producer, cancelled }) => {
                if(!cancelled) await this.wrapSubPersistent(producer)
            })
        )

    }

    private extractErrorFromMessageHeaders(message: amqp.ConsumeMessage) {

        const headers = message.properties.headers

        if(!headers) return new Error('Headless dead letter received from DLQ: '+message.content.toString())

        if(headers['x-error'])
            return (typeof(headers['x-error']) == 'string' ? JSON.parse(headers['x-error']) : headers['x-error']) as Error
        
        if(headers['x-death']) {

            const [{ reason }] = headers['x-death'] as XDeath[]

            const error = new Error(`Caught uncontrolled message in DLQ: ${reason}`)

            return formatErrorRecursive(error)

        }

        return new Error('Unrecognized error in dead letter: '+message.content.toString())

    }

    async sendSagaRequest<RequestType extends DefaultSagaRequestType>(
        request_queue_name: string,
        request: RequestType,
        options?: { default_dlq?: string }
    ): Promise<void> {

        await this.connection()

        const channel = await this.requestChannel(request_queue_name, options ? options.default_dlq : DEFAULT_UNSPECIFIED_DLQ),
            message = JSON.stringify(request)

        const sent = channel.sendToQueue(request_queue_name, Buffer.from(message), { persistent: true });
        if(!sent) throw new Error('Unexpected message rejection for '+message)

    }

    async sendDeadLetter<LetterType extends DefaultSagaResponseType>(
        dead_letter_queue_name: string,
        input: LetterType,
        error: Error,
        letter_ttl: number = DEFAULT_DLQ_MESSAGE_TTL
    ): Promise<void> {
        
        await this.connection()

        const channel = await this.requestChannel(dead_letter_queue_name),
            message = JSON.stringify(input)

        const sent = channel.sendToQueue(
            dead_letter_queue_name,
            Buffer.from(message),
            {
                persistent: true,
                headers: {
                    'x-error': formatErrorRecursive(error),
                    'x-message-ttl': letter_ttl
                }
            });
        if(!sent) throw new Error('Unexpected message rejection: '+message)

    }

    private async wrapSubPersistent(
        subProducer: () => Promise<{ channel: amqp.Channel, consumeResult: amqp.Replies.Consume }>
    ) {

        let sub = await subProducer(),
            { consumeResult, channel } = sub,
            consumerId = consumeResult.consumerTag

        const cancel = async () => {
                this.consumerSubscriptions[consumerId].cancelled = true
                await channel.cancel(sub.consumeResult.consumerTag)
            }

        this.consumerSubscriptions[consumerId] = { producer: subProducer, cancelled: false }

        return cancel

    }

    async subscribeToSagaQueue<ResponseType extends DefaultSagaResponseType>(
        response_queue_name: string,
        callback: (response: ResponseType) => Promise<void>,
        dead_letter_queue_name?: string
    ) {

        await this.connection()

        const wrapSub = async() => {

            const channel = await this.requestChannel(response_queue_name, dead_letter_queue_name || DEFAULT_UNSPECIFIED_DLQ)

            const consumeResult = await channel.consume(response_queue_name, async (msg) => {

                if(msg !== null) {

                    const content = JSON.parse(msg.content.toString()) as ResponseType

                    try {

                        await callback(content)
                        channel.ack(msg)

                    } catch(ex) {

                        channel.nack(msg, true, false)

                    }

                }

            }, { noAck: false })

            return { channel, consumeResult }

        }

        const cancel = await this.wrapSubPersistent(wrapSub)
        return cancel

    }

    async subscribeToSagaDLQ<DeadLetterType extends DefaultSagaResponseType>(
        dlq_name: string,
        callback: (dead_letter: DeadLetterType, error: Error) => void | Promise<void>
    ) {

        await this.connection()

        const wrapSub = async() => {

            const channel = await this.requestChannel(dlq_name)
            
            const consumeResult = await channel.consume(dlq_name, async (msg) => {

                if(msg !== null) {

                    const content = JSON.parse(msg.content.toString()) as DeadLetterType
                    const error = this.extractErrorFromMessageHeaders(msg)

                    try {

                        await callback(content, error)
                        channel.ack(msg)

                    } catch(ex) {

                        (ex as Error).cause = error
                        msg.properties!.headers!['x-error'] = formatErrorRecursive(ex as Error)
                        channel.nack(msg)

                    }

                }

            }, { noAck: false })

            return { channel, consumeResult }

        }
        
        const cancel = await this.wrapSubPersistent(wrapSub)

        return cancel

    }

}