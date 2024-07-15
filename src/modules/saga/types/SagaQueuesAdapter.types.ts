import { DefaultSagaRequestType, DefaultSagaResponseType } from "../types/Saga.types";

type ConsumerCancelHandler = () => unknown

export interface SagaQueuesAdapter<CredentialsType extends {} = {}> {

    setupCredentials(credentials: CredentialsType): CredentialsType

    connection(): Promise<void>

    dispose(): Promise<void>

    sendSagaRequest<RequestType extends DefaultSagaRequestType>(
        request_queue_name: string,
        request: RequestType,
        options: {
            default_dlq: string
        }
    ): Promise<void>

    sendDeadLetter<
        LetterType extends DefaultSagaResponseType
    >(
        dead_letter_queue_name: string,
        input: LetterType,
        error: Error,
        ttl?: number
    ): Promise<void>

    subscribeToSagaQueue<ResponseType extends DefaultSagaResponseType>(
        response_queue_name: string,
        callback: (response: ResponseType) => Promise<void>,
        dead_letter_queue?: string
    ): Promise<ConsumerCancelHandler>

    subscribeToSagaDLQ<DeadLetterType extends DefaultSagaResponseType>(
        dlq_name: string,
        callback: (dead_letter: DeadLetterType, error: Error) => Promise<void>
    ): Promise<ConsumerCancelHandler>

}