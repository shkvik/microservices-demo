import { DefaultSagaRequestType, DefaultSagaResponseType } from "../types/Saga.types";


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
        error: Error
    ): Promise<void>

    getErrorFromDeadLetter<LetterType extends DefaultSagaResponseType>(letter: LetterType): Error

    subscribeToSagaQueue<ResponseType extends DefaultSagaResponseType>(
        response_queue_name: string,
        callback: (response: ResponseType) => void
    ): void

    subscribeToSagaDLQ<DeadLetterType extends DefaultSagaResponseType>(
        dlq_name: string,
        callback: (dead_letter: DeadLetterType) => void
    ): void

}