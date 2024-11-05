import 'mocha'
import { expect } from 'chai'
import { SagaOperator } from '../../../src/modules/saga/components/SagaOperator'
import { StubSagaQueuesAdapter } from '../../../src/modules/saga/adapters/queues/Stub.SagaQueues.adapter'
import { StubSagaResponseChannelAdapter } from '../../../src/modules/saga/adapters/channels/Stub.SagaResponseChannel.adapter'
import { SagaContext } from '../../../src/modules/saga/components/SagaContext'
import { SagaRunner } from '../../../src/modules/saga/components/SagaRunner'
import { randomUUID } from 'crypto'
import { DefaultSagaResponseType } from '../../../src/modules/saga/types/Saga.types'
import { SagaEntrypoint } from '../../../src/modules/saga/components/SagaEntrypoint'

describe('Sagas unit testing', () => {

    describe('StubSagaQueueAdapter unit testing', () => {

        beforeAll(() => StubSagaQueuesAdapter.flush())
        afterAll(() => StubSagaQueuesAdapter.flush())

        it('Subscribe to queue and send a message: should react upon message arrival', async function(){

            const adapter = new StubSagaQueuesAdapter(),
                request_id = randomUUID()

            const result = await new Promise<DefaultSagaResponseType>((resolve) => {

                adapter.subscribeToSagaQueue('test', async (response) => resolve(response))

                adapter.sendSagaRequest('test', { request_id, arbitrary: 'foobar' }, { default_dlq: 'trash' })

            })

            expect(result).not.null.and.not.undefined
            expect(result.request_id).eq(request_id)
            expect(result.arbitrary).eq('foobar')

        })

    })

    describe('SagaRunner unit testing', () => {

        beforeAll(() => StubSagaQueuesAdapter.flush())
        afterAll(() => StubSagaQueuesAdapter.flush())

        let runners : SagaRunner[] = []

        it('Define chain of Saga runners: should succeed', async function () {

            const runner1 = await new SagaRunner()
                .useQueueAdapter(new StubSagaQueuesAdapter())
                .useContext(
                    new SagaContext('saga_test_context')
                        .input('runner1_in')
                        .output('runner1_out')
                        .dlq('runner1_errors')
                        .nextdlq('runner2_errors')
                )
                .handleTask(async (task) => {

                    task.foo = 'bar'
                    return task

                }).handleError(async (error, input) => {

                    return { error, input }

                }).handleNextDLQ(async(error, input) => {

                    input.handledAsNextDLX = true
                    delete input.bar
                    return { input, error }

                }).launch()

            runners.push(runner1)

            const runner2 = await new SagaRunner()
                .useQueueAdapter(new StubSagaQueuesAdapter())
                .useContext(
                    new SagaContext('saga_test_context')
                        .input('runner1_out')
                        .output('runner2_out')
                        .dlq('runner2_errors')
                ).handleTask(async (task) => {

                    task.bar = 'foo'
                    if(task.shouldError) throw new Error('Task is erroneous')
                    return task

                }).handleError(async (error, input) => {

                    return { error, input }

                }).launch()

            runners.push(runner2)

        })

        it('Push task to input queue: should be processed correctly and produce valid response', async function() {

            const adapter = new StubSagaQueuesAdapter(),
                request_id = randomUUID()

            const response = await new Promise<DefaultSagaResponseType>((resolve, reject) => {

                adapter.subscribeToSagaQueue('runner2_out', async(msg) => resolve(msg))
                adapter.subscribeToSagaDLQ('runner1_errors', async(msg, err) => reject(err))

                adapter.sendSagaRequest(
                    'runner1_in', { request_id, arbitrary: 'foobar' }, { default_dlq: 'runner1_errors' }
                )

            })

            expect(response).not.null.and.not.undefined
            expect(response.request_id).eq(request_id)
            expect(response.arbitrary).eq('foobar')
            expect(response.bar).eq('foo')
            expect(response.foo).eq('bar')

        })

        it('Push erroneous task to input queue: should produce error message and pass to DLQ', async function(){

            const adapter = new StubSagaQueuesAdapter(),
                request_id = randomUUID()

            const {response, error} : { response: DefaultSagaResponseType, error: Error | undefined} = await new Promise((resolve, reject) => {

                adapter.subscribeToSagaDLQ('runner1_errors', async (response, error) => resolve({ response, error }))
                adapter.subscribeToSagaQueue('runner2_out', async(msg) => reject(new Error('Got response instead of error')))

                adapter.sendSagaRequest('runner1_in', { request_id, shouldError: true }, { default_dlq: 'runner1_errors' })

            })

            expect(response).not.null.and.not.undefined
            expect(response.request_id).eq(request_id)
            expect(response.shouldError).eq(true)
            expect(response.foo).eq('bar')
            expect(response.bar).undefined

            expect(error).not.null.and.not.undefined
            expect(error!.stack).not.null.and.not.undefined
            expect(error!.stack!).match(/Task is erroneous/)

        })

    })

    describe('SagaOperator unit testing', () => {

        beforeAll(() => {
            StubSagaQueuesAdapter.flush()
            StubSagaResponseChannelAdapter.flush()
        })
        afterAll(() => {
            StubSagaQueuesAdapter.flush()
            StubSagaResponseChannelAdapter.flush()
        })

        let operator: SagaOperator

        it('Create SagaOperator: should succeed', () => {

            operator = new SagaOperator()

        })

        it('Assign queue and response channel adapters: should succeed', () => {

            operator.useQueueAdapter(new StubSagaQueuesAdapter())
            operator.useResponseChannelAdapter(new StubSagaResponseChannelAdapter())

        })

        it('Initialize Saga context within operator: should succeed', () => {

            const context = new SagaContext('foobar')
                .input('foo_input')
                .output('bar_output')
                .dlq('errors')
                .timeout(1000)

            operator.setupContext(context)

        })

        it('Init SagaRunner for a given context and execute a task: should succeed', async function(){

            const context = operator.getContext('foobar')!

            expect(context).not.null.and.not.undefined

            await new SagaRunner()
                .useQueueAdapter(new StubSagaQueuesAdapter())
                .useContext(context)
                .handleTask(async (task) => {

                    task.foo = 'bar'
                    return task

                }).launch()

            const request_id = randomUUID()

            const response = await operator.executeTask(context, { request_id })

            expect(response).not.null.and.not.undefined
            expect(response.request_id).eq(request_id)
            expect(response.foo).eq('bar')

        })

        it('Execute erroneous task: should receive error message from response publisher', async function(){

            const context = new SagaContext('erroneous')
                .input('erroneous_in')
                .output('erroneous_out')
                .dlq('erroneous_error')

            await new SagaRunner()
                .useQueueAdapter(new StubSagaQueuesAdapter())
                .useContext(context)
                .handleTask(async () => {

                    throw new Error('Erroneous message given')

                }).handleError(async (error, input) => {

                    return { error, input }

                }).launch()

            const request_id = randomUUID()

            try {

                const response = await operator.executeTask(context, { request_id })
                throw new Error('Unexpected successful response: '+JSON.stringify(response))

            } catch(ex) {

                expect((ex as Error).stack).match(/Erroneous message given/)

            }

        })

    })

    describe('SagaEntrypoint unit testing', () => {

        beforeAll(() => {
            StubSagaQueuesAdapter.flush()
            StubSagaResponseChannelAdapter.flush()

        })
        afterAll(() => {
            StubSagaQueuesAdapter.flush()
            StubSagaResponseChannelAdapter.flush()
        })

        const queueAdapter = new StubSagaQueuesAdapter(),
            publisherAdapter = new StubSagaResponseChannelAdapter(),

            operator = new SagaOperator()
                .useQueueAdapter(queueAdapter)
                .useResponseChannelAdapter(publisherAdapter),

            contextSingle = new SagaContext('entrypoint_saga')
                .input('entrypoint_in')
                .output('entrypoint_out')
                .dlq('entrypoint_error'),

            epSingle = new SagaEntrypoint()
                .useOperator(operator)
                .useContext(contextSingle)

        it('Setup SagaRunner for single-node saga', () => {

            new SagaRunner()
                .useQueueAdapter(queueAdapter)
                .useContext(contextSingle)
                .handleTask(async task => {
                    if(task.shouldError)
                        throw new Error('Task should throw error here')
                    return task
                }).launch()

        })

        it('Execute Saga using predefined context through SagaEntrypoint: should execute and publish response into dedicated channel', async function(){

            const request_id = randomUUID(),
                response = await epSingle.run({ request_id })

            expect(response).not.null.and.not.undefined

        })

        it('Execute Saga with erroneous message: should execute error handles and publish error into dedicated channel', async function(){

            const request_id = randomUUID()

            try {

                await epSingle.run({ request_id, shouldError: true })

            } catch(ex) {

                expect((ex as Error).stack).match(/Task should throw error here/)

            }
            
        })

        const epMultiple = new SagaEntrypoint()
            .useOperator(operator)

        it('Setup SagaRunners for multi-node saga', () => {

            const contextMultiple = new SagaContext('entrypoint_multi')
                .input('ep_multi_in')
                .output('ep_multi_out')
                .dlq('ep_multi_error');

            epMultiple.useContext(contextMultiple)

            const contextMultiRunner1 = new SagaContext('ep_multi_runner1')
                    .input('ep_multi_in')
                    .output('ep_multi_next')
                    .dlq('ep_multi_error')
                    .nextdlq('ep_multi_runner2_errors'),

                contextMultiRunner2 = new SagaContext('ep_multi_runner2')
                    .input('ep_multi_next')
                    .output('ep_multi_out')
                    .dlq('ep_multi_runner2_errors')

            new SagaRunner()
                .useQueueAdapter(queueAdapter)
                .useContext(contextMultiRunner1)
                .handleTask(async task => {
                    task.foo = 'bar'
                    return task
                })
                .handleNextDLQ(async (error, input) => {
                    delete input.foo // rollback
                    return {
                        input,
                        error: new Error('Second runner thrown error, rolling back:', { cause: error })
                    }
                })
                .launch()

            new SagaRunner()
                .useQueueAdapter(queueAdapter)
                .useContext(contextMultiRunner2)
                .handleTask(async task => {

                    if(task.shouldError) throw new Error('Should error at second runner')
                    return task

                }).launch()

        })

        it('Execute Saga of multiple runners: should execute and produce valid results', async function(){

            const request_id = randomUUID()

            const response = await epMultiple.run({ request_id  })

            expect(response).not.null.and.not.undefined
            expect(response.request_id).eq(request_id)
            expect(response.foo).eq('bar')

        })

        it('Execute Saga with error thrown in a midst of runners chain: should pass error up too entrypoint execution scope', async function(){

            const request_id = randomUUID()

            try {

                await epMultiple.run({ request_id, shouldError: true })

            } catch(ex) {
                
                expect((ex as Error).stack).match(/Second runner thrown error/)

                expect((ex as Error).cause).not.undefined

                expect(((ex as Error).cause as Error).stack).match(/Should error at second runner/)

            }

        })

    })

    describe('Queue adapter connection disruption behavior testing', () => {

        beforeAll(() => {
            StubSagaQueuesAdapter.flush()
            StubSagaResponseChannelAdapter.flush()

        })
        afterAll(() => {
            StubSagaQueuesAdapter.flush()
            StubSagaResponseChannelAdapter.flush()
        })

        it('Reset adapter connection while used by SagaRunner: should successfully restore listeners upon reconnect', async function(){

            const context = new SagaContext('disrupted')
                .input('disrupted_in')
                .output('disrupted_out')
                .dlq('disrupted_dlq'),
                queueAdapter = new StubSagaQueuesAdapter()
                
                await new SagaRunner()
                    .useQueueAdapter(queueAdapter)
                    .useContext(context)
                    .handleTask(async task => {
                        if(task.shouldError) throw new Error('Should error here')
                        task.succeeded = true
                        return task
                    })
                    .handleError(async (error, input) => ({ error, input }))
                    .launch()

            const request_id = randomUUID()

            const response = await new Promise<DefaultSagaResponseType>(async (resolve) => {

                const cancel = await queueAdapter.subscribeToSagaQueue('disrupted_out', async(res) => {

                    await cancel()
                    resolve(res)

                })

                // connection reset afterAll subscription
                StubSagaQueuesAdapter.resetConnection()

                queueAdapter.sendSagaRequest('disrupted_in', { request_id }, { default_dlq: 'disrupted_dlq' })

            })

            expect(response).not.null.and.not.undefined
            expect(response.request_id).eq(request_id)
            expect(response.succeeded).eq(true)

        })

        it('Reset adapter connection while used by SagaOperator: should successfully restore listeners upon reconnect', async function(){

            const context = new SagaContext('disrupted')
                .input('disrupted_in')
                .output('disrupted_out')
                .dlq('disrupted_dlq'),
                queueAdapter = new StubSagaQueuesAdapter()
                
                await new SagaRunner()
                    .useQueueAdapter(queueAdapter)
                    .useContext(context)
                    .handleTask(async task => {
                        if(task.shouldError) throw new Error('Should error here')
                        task.succeeded = true
                        return task
                    })
                    .handleError(async (error, input) => ({ error, input }))
                    .launch()

            const request_id = randomUUID()

            const operator = new SagaOperator()
                    .useQueueAdapter(queueAdapter)
                    .useResponseChannelAdapter(new StubSagaResponseChannelAdapter())

            const response = await new Promise<DefaultSagaResponseType>((resolve, reject) => {

                operator.executeTask(context, { request_id }).then((response) => {

                    resolve(response)

                })

                // connection reset during task execution
                StubSagaQueuesAdapter.resetConnection()

            })

            expect(response.request_id).eq(request_id)
            expect(response.succeeded).eq(true)

        })

    })

})