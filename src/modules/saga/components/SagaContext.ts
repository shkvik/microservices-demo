
/**
 * Describes a context for Sagas for both SagaRunners and SagaEntrypoints
 */
export class SagaContext {

    private inputQueue?: string
    private outputQueue?: string
    private dlQueue?: string
    private nextDlQueue?: string
    private contextName: string
    private timeoutMs?: number

    constructor(name: string){

        this.contextName = name

    }

    /**
     * For SagaEntrypoint: an input message queue that will be consumed by next mocriservice in a chain
     * 
     * For SagaRunner: an input message queue to consume messages as tasks from
     */
    input(queue_name: string){

        this.inputQueue = queue_name
        return this

    }

    /**
     * For SagaEntrypoint: an output queue to expect the result from, that is produced either by a last microservice in a chain (choreography)
     * or a Saga coordinator (orchestration)
     * 
     * For SagaRunner: an output queue to push a task execution result to
     */
    output(queue_name: string) {

        this.outputQueue = queue_name
        return this

    }

    /**
     * For SagaEntrypoint: a resulting DLQ to consume error messages from
     * 
     * For SagaRunner: a DLQ to deliver error messages to
     */
    dlq(dead_letter_queue_name: string) {

        this.dlQueue = dead_letter_queue_name
        return this

    }

    /**
     * For SagaRunner only: a DLQ that contains messages from next microservices in Saga chain (choreography)
     * or a coordinator (orchestration)
     */
    nextdlq(next_dlq_name: string) {

        this.nextDlQueue = next_dlq_name
        return this

    }

    timeout(ms: number) {

        this.timeoutMs = ms
        return this

    }

    /**
     * For SagaEntrypoint: an input message queue that will be consumed by next mocriservice in a chain
     * 
     * For SagaRunner: an input message queue to consume messages as tasks from
     */
    get inputQueueName() { return this.inputQueue }

    /**
     * For SagaEntrypoint: an output queue to expect the result from, that is produced either by a last microservice in a chain (choreography)
     * or a Saga coordinator (orchestration)
     * 
     * For SagaRunner: an output queue to push a task execution result to
     */
    get outputQueueName() { return this.outputQueue }

    /**
     * For SagaEntrypoint: a resulting DLQ to consume error messages from
     * 
     * For SagaRunner: a DLQ to deliver error messages to
     */
    get deadLetterQueueName() { return this.dlQueue }

    /**
     * For SagaRunner only: a DLQ that contains messages from next microservices in Saga chain (choreography).
     * Should not be specified for orchestrated sagas
     */
    get nextDeadLetterQueueName() { return this.nextDlQueue }

    /**
     * Context identifier for querying through SagaOperator
     */
    get name() { return this.contextName }

    /**
     * For SagaOperator/SagaEntrypoint only: Execution timeout triggered when no response received from a consumed queue
     */
    get execTimeout() { return this.timeoutMs }

}