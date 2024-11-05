import 'mocha'
import { expect } from 'chai'
import { RabbitMQCredentials, RabbitMQSagaQueuesAdapter } from '../../../src/modules/saga/adapters/queues/RabbitMQ.SagaQueues.adapter'
import { randomUUID } from 'crypto'
import { DefaultSagaResponseType } from '../../../src/modules/saga/types/Saga.types'
import { SagaRunner } from '../../../src/modules/saga/components/SagaRunner'
import { SagaContext } from '../../../src/modules/saga/components/SagaContext'
import { get, delete as delete_ } from 'axios';
import * as dotenv from 'dotenv';



describe('RabbitMQSagaAdapter integration tests', () => {
    dotenv.config();
    
    const credentials: RabbitMQCredentials = {
        protocol: process.env.RABBITMQ_DEFAULT_PROTOCOL,
        hostname: process.env.RABBITMQ_DEFAULT_HOST,
        username: process.env.RABBITMQ_DEFAULT_USER,
        password: process.env.RABBITMQ_DEFAULT_PASS,
        port: Number(process.env.RABBITMQ_DEFAULT_PORT),
    }

    beforeAll(async () => {

    })

    describe('Connectivity tests', () => {

        let adapter: RabbitMQSagaQueuesAdapter

        afterAll(async function () {
            if (adapter) await adapter.dispose()
        })

        it('Create instance and set up credentials: should succeed', async function () {

            adapter = new RabbitMQSagaQueuesAdapter()
            adapter.setupCredentials(credentials)

        })

        it('Establish connection: should succeed', async function () {

            await adapter.connection()

        })

        it('Use connection awaiter second time: should re-use open connection', async function () {

            await adapter.connection()

        })

        it('Drop internal connection: should re-establish upon next `connect` call', async function () {

            await adapter['rabbit_connecton']!.close()

            await adapter.connection()

        })

        it('Dispose & re-establish: should error', async function () {

            await adapter.dispose()

            try {

                await adapter.connection()

            } catch (ex) {

                expect((ex as Error).message).match(/Adapter connection disposed/)

            }


        })

        it('Clean queues', async function () {
            const RABBITMQ_API_URL = `http://localhost:15672/api/queues`;
            const VHOST = '/';

            const response = await get<{ name: string }[]>(RABBITMQ_API_URL, {
                auth: {
                    username: 'guest',
                    password: 'guest'
                }
            });
            const queues = response.data;
            const requests = queues.map(async (queue) => {
                const queueName = queue.name;
                const encodedVhost = encodeURIComponent(VHOST);
                const encodedQueueName = encodeURIComponent(queueName);
                const deleteUrl = `${RABBITMQ_API_URL}/${encodedVhost}/${encodedQueueName}`;
                await delete_(deleteUrl, {
                    auth: {
                        username: 'guest',
                        password: 'guest'
                    }
                });
            })
            await Promise.all(requests);
        })

    })

    describe('I/O tests', () => {

        let adapter = new RabbitMQSagaQueuesAdapter()
        adapter.setupCredentials(credentials)

        afterAll(async function () {
            await adapter.dispose()
        })

        it('Send message to queue and consume: should succeed', async function () {

            const request_id = randomUUID()

            const consumed = await new Promise<DefaultSagaResponseType>(async (resolve) => {

                const cancel = await adapter.subscribeToSagaQueue('test', async (message) => {

                    await cancel()
                    resolve(message)

                }, 'unknown_errors')

                adapter.sendSagaRequest('test', { request_id }, { default_dlq: 'unknown_errors' })

            })

            expect(consumed).not.null.and.not.undefined
            expect(consumed.request_id).eq(request_id)

        })

        it('Send error letter to DLQ and consume: should succeed', async function () {

            const request_id = randomUUID()

            adapter.sendDeadLetter('unknown_errors', { request_id }, new Error('Arbitrary error'))

            const consumed = await new Promise<DefaultSagaResponseType>(async (resolve) => {

                const cancel = await adapter.subscribeToSagaDLQ('unknown_errors', async (message) => {

                    await cancel()
                    resolve(message)

                })

            })

            expect(consumed).not.null.and.not.undefined
            expect(consumed.request_id).eq(request_id)

        })

    })

    describe('SagaRunner interopability test', () => {

        let adapter: RabbitMQSagaQueuesAdapter

        beforeAll(async function () {

            adapter = new RabbitMQSagaQueuesAdapter()
            adapter.setupCredentials(credentials)

        })

        afterAll(async function () {
            await adapter.dispose()

        })

        it('Create one-step Saga of SagaRunners using MQ adapter: should succeed', async function () {

            const oneStepContext = new SagaContext('test_one_step')
                .input('tos:input1')
                .output('tos:output1')
                .dlq('tos:error1')

            const runner = await new SagaRunner()
                .useQueueAdapter(adapter)
                .useContext(oneStepContext)
                .handleTask(async task => {

                    if (task.shouldError) throw new Error('Errored as it should')
                    else task.executed = true

                    return task

                })
                .launch()

        })

        it('Execute one-step Saga: should succeed and produce valid result', async function () {

            const request_id = randomUUID()

            adapter.sendSagaRequest('tos:input1', { request_id }, { default_dlq: 'tos:error1' })

            const response = await new Promise<DefaultSagaResponseType>(async (resolve) => {

                const cancel = await adapter.subscribeToSagaQueue('tos:output1', async response => {

                    await cancel()
                    resolve(response)

                })

            })

            expect(response).not.null.and.not.undefined
            expect(response.request_id).eq(request_id)
            expect(response.executed).eq(true)

        })

        it('Execute one-step saga with error: should pass error to DLQ as an appropriate object', async function () {

            const request_id = randomUUID()

            adapter.sendSagaRequest('tos:input1', { request_id, shouldError: true }, { default_dlq: 'tos:error1' })

            const { input, error }: { input: DefaultSagaResponseType, error: Error | undefined } =
                await new Promise(async (resolve) => {

                    const cancel = await adapter.subscribeToSagaDLQ('tos:error1', async (input, error) => {
                        await cancel()
                        resolve({ input, error })
                    })

                })

            expect(input.request_id).eq(request_id)
            expect(input.shouldError).eq(true)
            expect(input.executed).undefined
            expect(error).not.null.and.not.undefined
            expect(error!.message).contain('Errored as it should')

        })

        it('Create three-step SagaRunners chain using MQ adapter: should succeed', async function () {

            // a context for request input
            const step1RunnerContext = new SagaContext('.3step_runner1')
                .input('.3step:input1')
                .output('.3step:input2')
                .dlq('.3step:error1')
                .nextdlq('.3step:error2'),

                // runner context for step 2
                step2RunnerContext = new SagaContext('.3step_runner2')
                    .input('.3step:input2')
                    .output('.3step:input3')
                    .dlq('.3step:error2')
                    .nextdlq('.3step:error3'),

                // runner context for step 3
                step3RunnerContext = new SagaContext('.3step_runner3')
                    .input('.3step:input3')
                    .output('.3step:output3')
                    .dlq('.3step:error3')

            // set up saga runner for step #1
            await new SagaRunner()
                .useQueueAdapter(adapter)
                .useContext(step1RunnerContext)
                .handleTask(async input => {

                    if (input.task1ShouldError) throw new Error('Errored at task #1')

                    input.task1Complete = true
                    return input

                })
                .handleError(async (error, input) => {

                    input.task1Errored = true
                    return { error, input }

                })
                .handleNextDLQ(async (error, input) => {

                    input.task1CaughtNext = true
                    //rollback
                    delete input.task1Complete
                    return {
                        input, error: new Error('Caught error from task runner #2')
                    }

                })
                .launch()

            // set up saga runner for task #2
            await new SagaRunner()
                .useQueueAdapter(adapter)
                .useContext(step2RunnerContext)
                .handleTask(async input => {

                    if (input.task2ShouldError) throw new Error('Errored at task #2')

                    input.task2Complete = true
                    return input

                })
                .handleError(async (error, input) => {

                    input.task2Errored = true
                    return { error, input }

                })
                .handleNextDLQ(async (error, input) => {

                    input.task2CaughtNext = true
                    //rollback
                    delete input.task2Complete
                    return {
                        input, error: new Error('Caught error from task runner #3')
                    }

                })
                .launch()

            // set up saga runner for task #3
            await new SagaRunner()
                .useQueueAdapter(adapter)
                .useContext(step3RunnerContext)
                .handleTask(async input => {

                    if (input.task3ShouldError) throw new Error('Errored at task #3')

                    input.task3Complete = true
                    return input

                })
                .handleError(async (error, input) => {

                    input.task3Errored = true
                    return { input, error }

                })
                // no next DLQ handler here for last runner in responsibility chain
                .launch()

        })

        it('Execute full Saga without expected errors: should succeed & pass all assigned mutations as response', async function () {

            const request_id = randomUUID()

            adapter.sendSagaRequest('.3step:input1', { request_id }, { default_dlq: '.3step:error1' })

            const response: DefaultSagaResponseType = await new Promise(async (resolve) => {

                const cancel = await adapter.subscribeToSagaQueue('.3step:output3', async (res) => {
                    await cancel()
                    resolve(res)
                })

            })

            expect(response).not.null.and.not.undefined
            expect(response.request_id).eq(request_id)
            expect(response.task1Complete).eq(true)
            expect(response.task2Complete).eq(true)
            expect(response.task3Complete).eq(true)

        })

        it('Execute full Saga with expected error at task #1: should produce error into according DLQ and never reach next steps', async function () {

            const request_id = randomUUID()

            adapter.sendSagaRequest('.3step:input1', { request_id, task1ShouldError: true }, { default_dlq: '.3step:error1' })

            const response: { input: DefaultSagaResponseType, error: Error | undefined } =
                await new Promise(async (resolve) => {

                    const cancel = await adapter.subscribeToSagaDLQ(
                        '.3step:error1', async (input, error) => {
                            await cancel()
                            resolve({ input, error })
                        }
                    )

                })

            expect(response).not.null.and.not.undefined

            const { input, error } = response

            expect(input).not.null.and.not.undefined
            expect(input.request_id).eq(request_id)
            expect(input.task1Complete).undefined

            expect(error).not.null.and.not.undefined
            expect(error!.message).contain('Errored at task #1')

        })

        it('Execute full Saga with expected error at task #2: should produce composite error from 2 of 3 steps in chain', async function () {

            const request_id = randomUUID()

            adapter.sendSagaRequest('.3step:input1', { request_id, task2ShouldError: true }, { default_dlq: '.3step:error1' })

            const response: { input: DefaultSagaResponseType, error: Error | undefined } =
                await new Promise(async (resolve) => {

                    const cancel = await adapter.subscribeToSagaDLQ(
                        '.3step:error1', async (input, error) => {
                            await cancel()
                            resolve({ input, error })
                        }
                    )

                })

            expect(response).not.null.and.not.undefined

            const { input, error } = response

            expect(input).not.null.and.not.undefined
            expect(input.request_id).eq(request_id)

            expect(input.task1Complete).undefined // check if properly rolled back at task #1
            expect(input.task1CaughtNext).eq(true) // check if properly caught as next dlq error by runner #1
            expect(input.task2Complete).undefined // check if properly rolled back at task #2
            expect(input.task2Errored).eq(true) // check if error produced by actual task runner #2

            expect(error).not.null.and.not.undefined

            // check if an error was properly wrapped by a roolback handler of runner #1
            expect(error!.message).contain('Caught error from task runner #2')
            expect(error!.cause).not.null.and.not.undefined
            expect((error!.cause! as Error).message).contain('Errored at task #2')

        })

        it('Execute full Saga with expected error at task #3: should produce composite error from all 3 steps', async function () {

            const request_id = randomUUID()

            adapter.sendSagaRequest('.3step:input1', { request_id, task3ShouldError: true }, { default_dlq: '.3step:error1' })

            const response: { input: DefaultSagaResponseType, error: Error | undefined } =
                await new Promise(async (resolve) => {

                    const cancel = await adapter.subscribeToSagaDLQ(
                        '.3step:error1', async (input, error) => {
                            await cancel()
                            resolve({ input, error })
                        }
                    )

                })

            expect(response).not.null.and.not.undefined

            const { input, error } = response

            expect(input).not.null.and.not.undefined
            expect(input.request_id).eq(request_id)

            expect(input.task1Complete).undefined // check if properly rolled back at task #1
            expect(input.task1CaughtNext).eq(true) // check if properly caught as next dlq error by runner #1
            expect(input.task2Complete).undefined // check if properly rolled back at task #2
            expect(input.task2CaughtNext).eq(true) // check if properly caught as next dlq error by runner #2
            expect(input.task3Complete).undefined // check if properly rolled back at taskk #3
            expect(input.task3Errored).eq(true) // check if error produced by acctual task runner #3

            expect(error).not.null.and.not.undefined

            // check if an error was properly wrapped by a roolback handler of runner #1
            expect(error!.message).contain('Caught error from task runner #2')
            expect(error!.cause).not.null.and.not.undefined
            expect((error!.cause! as Error).message).contain('Caught error from task runner #3')
            expect((error!.cause! as Error).cause).not.null.and.not.undefined
            expect(((error!.cause! as Error).cause as Error).message).contain('Errored at task #3')

        })

        it('Drop adapter internal connection & try executing Saga again: should restore consumers & succeed', async function () {

            await adapter['rabbit_connecton']!.close()

            const request_id = randomUUID()

            adapter.sendSagaRequest('.3step:input1', { request_id }, { default_dlq: '.3step:error1' })

            const response: DefaultSagaResponseType = await new Promise(async (resolve) => {

                const cancel = await adapter.subscribeToSagaQueue('.3step:output3', async (res) => {
                    await cancel()
                    resolve(res)
                })

            })

            expect(response).not.null.and.not.undefined
            expect(response.request_id).eq(request_id)
            expect(response.task1Complete).eq(true)
            expect(response.task2Complete).eq(true)
            expect(response.task3Complete).eq(true)

        })

    })

    describe('SagaOperator interopability test', () => {

        let adapter: RabbitMQSagaQueuesAdapter

        beforeAll(async function () {

            adapter = new RabbitMQSagaQueuesAdapter()
            adapter.setupCredentials(credentials)

        })
        
        it("should be defined", () => {
            expect(adapter).not.null;
        });

        afterAll(async function () {

            await adapter.dispose()

        })

    })

    //TODO: SagaOperator interopability test

})