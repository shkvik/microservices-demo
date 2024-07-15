import { Subject } from "rxjs";
import { DefaultSagaRequestType, DefaultSagaResponseType } from "../../types/Saga.types";
import { SagaQueuesAdapter } from "../../types/SagaQueuesAdapter.types";
import { formatErrorRecursive } from "../../helpers/RecursiveErrorsFormatting.helper";

export class StubSagaQueuesAdapter
implements SagaQueuesAdapter {

    private static ioQueues: {[queue_name: string]: Subject<DefaultSagaRequestType>} = {}
    private static dlQueues: {[queue_name: string]: Subject<DefaultSagaResponseType>} = {}

    constructor(){}

    setupCredentials(credentials: {}) {
        return credentials
    }

    async connection(): Promise<void> {
        return;
    }

    async sendSagaRequest<RequestType extends DefaultSagaRequestType>(
        request_queue_name: string,
        request: RequestType,
        options: { default_dlq: string }
    ): Promise<void> {

        await this.connection()
        
        if(!StubSagaQueuesAdapter.ioQueues[request_queue_name]) {
            StubSagaQueuesAdapter.ioQueues[request_queue_name] = new Subject()
        }

        StubSagaQueuesAdapter.ioQueues[request_queue_name].next({...request })

    }

    async sendDeadLetter<RequestType extends DefaultSagaResponseType>(
        dead_letter_queue_name: string,
        input: RequestType,
        error: Error
    ): Promise<void> {

        await this.connection()

        if(!StubSagaQueuesAdapter.dlQueues[dead_letter_queue_name])
            StubSagaQueuesAdapter.dlQueues[dead_letter_queue_name] = new Subject()

        StubSagaQueuesAdapter.dlQueues[dead_letter_queue_name].next({
            ...input,
            __error: formatErrorRecursive(error)
        })
    }

    getErrorFromDeadLetter<LetterType extends DefaultSagaResponseType>(letter: LetterType): Error | undefined {

        if(letter.__error)
            return formatErrorRecursive(letter.__error as Error) as Error

        return undefined

    }

    async subscribeToSagaQueue<ResponseType extends DefaultSagaResponseType>(
        response_queue_name: string,
        callback: (response: ResponseType) => Promise<void>
    ): Promise<void> {

        await this.connection()
        
        if(!StubSagaQueuesAdapter.ioQueues[response_queue_name]) {
            StubSagaQueuesAdapter.ioQueues[response_queue_name] = new Subject()
        }

        StubSagaQueuesAdapter.ioQueues[response_queue_name]
            .subscribe(async (response) => {

                await callback(response as unknown as ResponseType)

            })

    }

    async subscribeToSagaDLQ<DeadLetterType extends DefaultSagaResponseType>(
        dlq_name: string,
        callback: (dead_letter: DeadLetterType, error?: Error) => Promise<void>
    ): Promise<void> {
        
        if(!StubSagaQueuesAdapter.dlQueues[dlq_name])
            StubSagaQueuesAdapter.dlQueues[dlq_name] = new Subject()

        StubSagaQueuesAdapter.dlQueues[dlq_name].subscribe(async (dead_letter) => {

            const error = this.getErrorFromDeadLetter(dead_letter)

            await callback(dead_letter as unknown as DeadLetterType, error)

        })

    }

    async dispose() { StubSagaQueuesAdapter.flush() }

    public static flush() {

        Object.keys(StubSagaQueuesAdapter.ioQueues)
            .map(queue => StubSagaQueuesAdapter.ioQueues[queue].complete())
        StubSagaQueuesAdapter.ioQueues = {}

        Object.keys(StubSagaQueuesAdapter.dlQueues)
            .map(queue => StubSagaQueuesAdapter.dlQueues[queue].complete())
        StubSagaQueuesAdapter.dlQueues = {}

    }

}