import { DefaultSagaRequestType, DefaultSagaResponseType } from "../types/Saga.types"

export interface SagaResponseChannelAdapter<CredentialsType extends {} = {}> {

    setupCredentials(credentials: CredentialsType): CredentialsType

    /**
     * Checks for a current connection to be established.
     * By default, should return when current connection is established an active
     * Otherwise, should reconnect before resolving
     */
    connection(): Promise<void>

    /**
     * Publishes a response received from Saga output message queue for dedicated consumer
     */
    publishResponse<
        SagaResponse extends DefaultSagaResponseType
    >(
        response: SagaResponse
    ): void;

    /**
     * Publishes a Saga error response received from Saga DLQ message queue for dedicated consumer
     */
    publishError<
        SagaErrorResponseType extends DefaultSagaResponseType
    >(
        letter: SagaErrorResponseType,
        error: Error
    ): void;

    /**
     * Subscribes to a channel that produces a response for dedicated consumer
     */
    subscribeToResponse<SagaResponse extends DefaultSagaRequestType>(
        request_id: string,
        callback: (response: SagaResponse) => void
    ): Promise<SagaResponse>;

    /**
     * Subscribes to a channel that produces an error response for dedicated consumer
     */
    subscribeToError<SagaErrorResponseType extends DefaultSagaResponseType>(
        request_id: string,
        callback: (response: SagaErrorResponseType, error: Error) => void
    ): Promise<{ response: SagaErrorResponseType, error: Error }>

    /**
     * Disposes both successful response and error response channels
     */
    disposeSubscriptions(request_id: string): Promise<void>;

}