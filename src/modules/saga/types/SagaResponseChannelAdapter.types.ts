import { DefaultSagaRequestType, DefaultSagaResponseType, SagaResponseChannelAdapterCredentialsType } from "../types/Saga.types"

export interface SagaResponseChannelAdapter {

    setupCredentials<Credentials extends SagaResponseChannelAdapterCredentialsType>(credentials: Credentials): Credentials

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
        SagaError extends DefaultSagaResponseType
    >(
        error: SagaError
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
    subscribeToError<SagaError extends DefaultSagaResponseType>(
        request_id: string,
        callback: (error: SagaError) => void
    ): Promise<SagaError>

    /**
     * Disposes both successful response and error response channels
     */
    disposeSubscriptions(request_id: string): Promise<void>;

}