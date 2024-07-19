import { AsyncLock } from "../../../async-lock/AsyncLocks";
import { formatErrorRecursive } from "../../helpers/RecursiveErrorsFormatting.helper";
import { DefaultSagaResponseType } from "../../types/Saga.types";
import { SagaResponseChannelAdapter } from "../../types/SagaResponseChannelAdapter.types";
import { RedisClientOptions, RedisClientType, RedisDefaultModules, RedisFunctions, RedisModules, RedisScripts, createClient } from 'redis'

interface SentinelCredentials
extends RedisClientOptions<RedisModules, RedisFunctions, RedisScripts> {}

interface RedisResponseChannelAdapterCredentials
extends RedisClientOptions<RedisModules, RedisFunctions, RedisScripts> {

    sentinel?: SentinelCredentials & { mainnode_name: string }

}

export class RedisSagaResponseChannelAdapter 
implements SagaResponseChannelAdapter<RedisResponseChannelAdapterCredentials> {

    private credentials?: RedisResponseChannelAdapterCredentials
    private connection_lock: AsyncLock
    private redis_publisher_connection?: RedisClientType<RedisDefaultModules & RedisModules, RedisFunctions, RedisScripts>
    private redis_subscriber_connection?: RedisClientType<RedisDefaultModules & RedisModules, RedisFunctions, RedisScripts>
    private disposed: boolean = false

    constructor(){
        this.connection_lock = new AsyncLock()
    }

    setupCredentials(credentials: RedisResponseChannelAdapterCredentials): RedisResponseChannelAdapterCredentials {
        this.credentials = credentials
        return credentials
    }

    private async getMainnodeCredentials(): Promise<RedisResponseChannelAdapterCredentials> {

        if(!this.credentials!.sentinel) return this.credentials!
        
        const sentinel = createClient(this.credentials?.sentinel)
        await sentinel.connect()
        const [host, port] : [string, string] =
            await sentinel.sendCommand(['SENTINEL', 'get-master-addr-by-name', this.credentials!.sentinel!.mainnode_name]);
        
        sentinel.disconnect()

        const credentials = {...this.credentials}

        if(!credentials.url)
            throw new Error('Redis mainnode discovered by Sentinel should have credentials defined as `url`')
        
        const url = new URL(credentials.url!)
            url.host = host;
            url.port = port

        credentials.url = url.toString()

        return credentials

    }

    private async establishConnection(
        credentials: RedisResponseChannelAdapterCredentials
    ){

        const connection = createClient(credentials)

        await connection.connect()

        return connection

    }

    //TODO: retries
    async connection(): Promise<void> {

        if(!this.credentials) throw new Error('Adapter requires credentials specified before establishing connection')
        if(this.disposed) throw new Error('Adapter connection disposed')

        await this.connection_lock.acquire()

        if(!this.redis_publisher_connection) {

            try {

                const credentials = await this.getMainnodeCredentials()
                this.redis_publisher_connection = await this.establishConnection(credentials)

            } catch(ex) {

                this.connection_lock.release()
                throw ex

            }
            

        }

        if(!this.redis_subscriber_connection) {

            try {

                this.redis_subscriber_connection = await this.establishConnection(this.credentials)

            } catch(ex) {

                this.connection_lock.release()
                throw ex

            }

        }
        
        this.connection_lock.release()

    }

    async publishResponse<SagaResponse extends DefaultSagaResponseType>(
        response: SagaResponse
    ): Promise<void> {

        if(!response.request_id) throw new Error('A published response does not refer to any unique request ID')
        
        const str = JSON.stringify({response}),
            channel = response.request_id+'.res'

        await this.connection()

        await this.redis_publisher_connection!.publish(channel, str)

    }

    async publishError<SagaErrorResponseType extends DefaultSagaResponseType>(
        letter: SagaErrorResponseType,
        error: Error
    ): Promise<void> {

        if(!letter.request_id) throw new Error('A published error does not refer to any unique request ID')
        
        const str = JSON.stringify({ response: letter, error: formatErrorRecursive(error) }),
            channel = letter.request_id+'.err'

        await this.connection()

        await this.redis_publisher_connection!.publish(channel, str)
        
    }

    async subscribeToResponse<SagaResponse extends DefaultSagaResponseType>(
        request_id: string,
        callback: (response: SagaResponse) => Promise<void>
    ): Promise<void> {

        await this.connection()

        const channel = request_id+'.res'

        await this.redis_subscriber_connection!.subscribe(channel, async (msg) => {

            const { response } = JSON.parse(msg) as { response: SagaResponse }

            await callback(response)

        })

    }

    async subscribeToError<SagaErrorResponseType extends DefaultSagaResponseType>(
        request_id: string,
        callback: (response: SagaErrorResponseType, error: Error) => Promise<void>
    ): Promise<void> {
        
        await this.connection()

        const channel = request_id+'.err'

        await this.redis_subscriber_connection!.subscribe(channel, async (msg) => {

            const { response, error } = JSON.parse(msg) as { response: SagaErrorResponseType, error: Error }

            await callback(response, error)

        })

    }

    async disposeSubscriptions(request_id: string): Promise<void> {
        
        await this.connection()

        await this.redis_subscriber_connection!.unsubscribe(request_id+'.res')
        await this.redis_subscriber_connection!.unsubscribe(request_id+'.err')

    }

    async dispose(): Promise<void> {
        if(this.disposed) return
        this.disposed = true
        if(this.redis_publisher_connection) this.redis_publisher_connection.quit()
        if(this.redis_subscriber_connection) this.redis_subscriber_connection.quit()
    }

}