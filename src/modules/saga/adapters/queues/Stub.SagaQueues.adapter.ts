import { Subject } from "rxjs";
import { DefaultSagaRequestType, DefaultSagaResponseType } from "../../types/Saga.types";
import { SagaQueuesAdapter } from "../../types/SagaQueuesAdapter.types";

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
        request: RequestType
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
            error: {
                message: error.message,
                stack: error.stack,
                cause: error.cause
            }
        })
    }

    getErrorFromDeadLetter<LetterType extends DefaultSagaResponseType>(letter: LetterType): Error {

        return letter.error as Error

    }

    async subscribeToSagaQueue<ResponseType extends DefaultSagaResponseType>(response_queue_name: string, callback: (response: ResponseType) => void): Promise<void> {

        await this.connection()
        
        if(!StubSagaQueuesAdapter.ioQueues[response_queue_name]) {
            StubSagaQueuesAdapter.ioQueues[response_queue_name] = new Subject()
        }

        StubSagaQueuesAdapter.ioQueues[response_queue_name]
            .subscribe((response) => {

                callback(response as unknown as ResponseType)

            })

    }

    subscribeToSagaDLQ<DeadLetterType extends DefaultSagaResponseType>(dlq_name: string, callback: (dead_letter: DeadLetterType) => void): void {
        
        if(!StubSagaQueuesAdapter.dlQueues[dlq_name])
            StubSagaQueuesAdapter.dlQueues[dlq_name] = new Subject()

        StubSagaQueuesAdapter.dlQueues[dlq_name].subscribe((dead_letter) => {

            callback(dead_letter as unknown as DeadLetterType)

        })

    }

    public static flush() {

        Object.keys(StubSagaQueuesAdapter.ioQueues)
            .map(queue => StubSagaQueuesAdapter.ioQueues[queue].complete())
        StubSagaQueuesAdapter.ioQueues = {}

        Object.keys(StubSagaQueuesAdapter.dlQueues)
            .map(queue => StubSagaQueuesAdapter.dlQueues[queue].complete())
        StubSagaQueuesAdapter.dlQueues = {}

    }

}