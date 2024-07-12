import { DefaultSagaRequestType, DefaultSagaResponseType, SagaQueuesAdapterCredentialsType } from "../types/Saga.types";
import { SagaQueuesAdapter } from "../types/SagaQueuesAdapter.types";
import { SagaContext } from "./SagaContext";

type SagaTaskHandler<
    RequestDataType extends DefaultSagaRequestType,
    ResponseDataType extends DefaultSagaResponseType
> = (request: RequestDataType) => Promise<ResponseDataType>

const DEFAULT_TASK_HANDLER : SagaTaskHandler<DefaultSagaRequestType, DefaultSagaResponseType> = async (request) => request

type SagaRunnerErrorHandler<
    RequestDataType extends DefaultSagaRequestType,
    ErrorMessageDataType extends DefaultSagaResponseType
> = (error: Error, input: RequestDataType) => Promise<ErrorMessageDataType>

const DEFAULT_ERROR_HANDLER : SagaRunnerErrorHandler<DefaultSagaRequestType, DefaultSagaResponseType> =
async(error, input) => ({ ...input, error: error.stack || error.toString() })

type SagaNextDeadLetterHandler<
    ErrorMessageDataType extends DefaultSagaResponseType,
    ErrorResponseDataType extends DefaultSagaResponseType
> = (letter: ErrorMessageDataType, error: Error) => Promise<{ letter: ErrorResponseDataType, error: Error }>

const DEFAULT_NEXT_DLQ_HANDLER : SagaNextDeadLetterHandler<DefaultSagaResponseType, DefaultSagaResponseType> = async (letter, error) => ({ letter, error })

export class SagaRunner {

    private queue_adapter?: SagaQueuesAdapter;

    useQueueAdapter<
        AdapterType extends SagaQueuesAdapter,
    >(adapter: AdapterType) {

        this.queue_adapter = adapter
        return this;

    }

    private context?: SagaContext;

    useContext(context: SagaContext) {

        this.context = context
        return this

    }

    private inputTaskHandler: SagaTaskHandler<DefaultSagaRequestType, DefaultSagaResponseType> = DEFAULT_TASK_HANDLER

    handleTask<
        RequestDataType extends DefaultSagaRequestType,
        ResponseDataType extends DefaultSagaResponseType
    >(handler: SagaTaskHandler<RequestDataType, ResponseDataType>) {

        if(!this.context || !this.context.inputQueueName)
            throw new Error('No input queue specified in context')
        this.inputTaskHandler = handler as unknown as SagaTaskHandler<DefaultSagaRequestType, DefaultSagaResponseType>
        return this

    }

    private errorHandler: SagaRunnerErrorHandler<DefaultSagaRequestType, DefaultSagaResponseType> = DEFAULT_ERROR_HANDLER

    handleError<
        RequestDataType extends DefaultSagaRequestType,
        ErrorMessageDataType extends DefaultSagaResponseType
    >(handler: SagaRunnerErrorHandler<RequestDataType, ErrorMessageDataType>) {

        if(!this.context || !this.context.deadLetterQueueName)
            throw new Error('No DLQ specified in context')
        this.errorHandler = handler as unknown as SagaRunnerErrorHandler<DefaultSagaRequestType, DefaultSagaResponseType>
        return this

    }

    private nextDLQHandler: SagaNextDeadLetterHandler<DefaultSagaResponseType, DefaultSagaResponseType> = DEFAULT_NEXT_DLQ_HANDLER

    /**
     * Handles rollback operation for a distributed microservice transaction upon receiving a dead letter from next microservice in chain (choreography)
     * or from a Saga coordinator (orchestration)
     */
    handleNextDLQ<
        ErrorType extends DefaultSagaResponseType,
        ResultType extends DefaultSagaResponseType
    >(handler: SagaNextDeadLetterHandler<ErrorType, ResultType>) {

        if(!this.context || !this.context.nextDeadLetterQueueName)
            throw new Error('Not next step DLQ specified in context to operate with')
        this.nextDLQHandler = handler as unknown as SagaNextDeadLetterHandler<DefaultSagaResponseType, DefaultSagaResponseType>
        return this

    }

    private async tryNotifyWithError<ErrorMessageType extends DefaultSagaResponseType>(
        message: ErrorMessageType,
        error: Error,
        dlqName?: string,
    ) {

        if(dlqName) this.queue_adapter!.sendDeadLetter(dlqName, message, error)
        else throw error

    }

    private setupSagaInputQueueSub() {

        this.queue_adapter!.subscribeToSagaQueue(this.context!.inputQueueName!, async (response) => {

            try {

                const result = await this.inputTaskHandler(response)
                this.queue_adapter!.sendSagaRequest(this.context!.outputQueueName!, result)


            } catch(ex) {

                try {

                    const errorHandlerResponse = await this.errorHandler(ex as Error, response)

                    this.tryNotifyWithError(errorHandlerResponse, ex as Error, this.context!.deadLetterQueueName)

                } catch(ex) {

                    const letter = response,
                        error = new Error('Could not process dead letter: ', { cause: ex })

                    this.tryNotifyWithError(letter, error, this.context!.deadLetterQueueName)

                }

            }

        })

    }

    private setupSagaNextDLQSub() {

        if(this.context!.nextDeadLetterQueueName)
        this.queue_adapter!.subscribeToSagaDLQ(this.context!.nextDeadLetterQueueName, async (nextStepDeadLetter) => {

            try {

                const originalError = this.queue_adapter!.getErrorFromDeadLetter(nextStepDeadLetter)
    
                const { letter, error } = await this.nextDLQHandler(nextStepDeadLetter, originalError)
                error.cause = originalError
                
                this.tryNotifyWithError(letter, error, this.context!.deadLetterQueueName)

            } catch(ex) {

                this.tryNotifyWithError(nextStepDeadLetter, ex as Error, this.context!.deadLetterQueueName)

            }
            
            
        })

    }

    launch() {

        if(!this.context) throw new Error('Saga context should be specified for SagaRunner')
        if(!this.context.inputQueueName)
            throw new Error('Saga context should have input tasks queue name specified')
        if(!this.context.outputQueueName)
            throw new Error('Saga context should have output queue name specified')

        if(!this.queue_adapter)
            throw new Error('SagaRunner should have a queue adapter assigned before launch')

        this.queue_adapter.connection().then(() => {

            this.setupSagaInputQueueSub()
            this.setupSagaNextDLQSub()

        })

        return this

    }

}