import 'mocha'
import { expect } from 'chai'
import { RedisSagaResponseChannelAdapter } from '../../../src/modules/saga/adapters/channels/Redis.SagaResponseChannel.adapter'
import { randomUUID } from 'crypto'
import { DefaultSagaResponseType } from '../../../src/modules/saga/types/Saga.types'
import { StubSagaQueuesAdapter } from '../../../src/modules/saga/adapters/queues/Stub.SagaQueues.adapter'
import { SagaContext } from '../../../src/modules/saga/components/SagaContext'
import { SagaRunner } from '../../../src/modules/saga/components/SagaRunner'
import { SagaOperator } from '../../../src/modules/saga/components/SagaOperator'

describe('RedisSagaResponseChannelAdapter integration tests', () => {

    const credentials : ReturnType<RedisSagaResponseChannelAdapter['setupCredentials']> = {
        url: process.env.REDIS_CONNECTION_URL
    }

    describe('Connectivity tests', () => {

        const adapter = new RedisSagaResponseChannelAdapter()

        after(async function(){
            await adapter.dispose()
        })

        it('Setup credentials: should succeed', () => {

            adapter.setupCredentials(credentials)

        })

        it('Establish a connection: should succeed', async function(){

            await adapter.connection()

        })

        it('Close internal connection: should re-establish upon second connection awaiter call', async function() {

            adapter['redis_publisher_connection']!.quit()

            await adapter.connection()

        })

        it('Dispose adapter & try connecting again: should error', async function() {

            await adapter.dispose()

            try {

                await adapter.connection()

            } catch(ex) {

                expect((ex as Error).message).contain('Adapter connection disposed')

            }

        })
        
    })

    describe('Publish & subscribe tests', () => {

        const adapter = new RedisSagaResponseChannelAdapter()
        adapter.setupCredentials(credentials)

        after(async function() {
            await adapter.dispose()
        })

        it('Publish response & obtain by response subscription: should succeed', async function(){

            const request_id = randomUUID()

            const response = await new Promise<DefaultSagaResponseType & { data: { foo: string } }>(async (resolve) => {

                await adapter.subscribeToResponse<DefaultSagaResponseType & { data: { foo: string } }>(
                    request_id,
                    async (response) => {
                        await adapter.disposeSubscriptions(response.request_id)
                        resolve(response)
                    }
                )

                await adapter.publishResponse({ request_id, data: { foo: 'bar' }})

            })

            expect(response.request_id).eq(request_id)
            expect(response.data!.foo).eq('bar')

        })

        it('Publish error & obtain by error response subscription: should succeed', async function() {

            const request_id = randomUUID()

            const { response, error } : {
                response: DefaultSagaResponseType & { data: { foo: string } },
                error: Error
            } = await new Promise(async (resolve) => {

                await adapter.subscribeToError<DefaultSagaResponseType & { data: { foo: string } }>(
                    request_id,
                    async (response, error) => {
                        await adapter.disposeSubscriptions(response.request_id)
                        resolve({ response, error })
                    }
                )

                await adapter.publishError({ request_id, data: { foo: 'bar' }}, new Error('Should error here'))

            })

            expect(response.request_id).eq(request_id)
            expect(response.data!.foo).eq('bar')
            expect(error).not.null.and.not.undefined
            expect(error.message).eq('Should error here')

        })

    })

    /*
    describe('SagaOperator interopability tests', () => {

        const adapter = new RedisSagaResponseChannelAdapter()
        adapter.setupCredentials(credentials)

        const queueAdapter = new StubSagaQueuesAdapter()
        queueAdapter.setupCredentials({})

        after(async function(){

            await adapter.dispose()

        })

        const context = new SagaContext('pubsub')
                .input('pubsub_input')
                .output('pubsub_output')
                .dlq('pubsub_dlq')

        const operator = new SagaOperator()
            .useQueueAdapter(queueAdapter)
            .useResponseChannelAdapter(adapter)

        it('Create one-step saga context, run and attach to SagaOperator', async function(){

            await new SagaRunner()
                .useQueueAdapter(queueAdapter)
                .useContext(context)
                .handleTask(async task => {

                    if(task.shouldError) throw new Error('Should error')
                    
                    task.complete = true
                    return task

                })
                .launch()

        })

        it('Send task to saga through Operator that uses Redis adapter: should obtain response from pub channel', async function(){

            const request_id = randomUUID()

            const response = await operator.executeTask(context, { request_id })

            expect(response.request_id).eq(request_id)
            expect(response.complete).eq(true)

        })
        it('Send erroneous task to saga: should obtain error response from error pub channel', async function(){

            const request_id = randomUUID()

            try {

                await operator.executeTask(context, { request_id, shouldError: true })

            } catch(ex) {

                expect((ex as Error).message).contain('Should error')
                
            }
            

        })

    })
    */

})