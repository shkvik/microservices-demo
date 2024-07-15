import { DefaultSagaRequestType, DefaultSagaResponseType } from "../types/Saga.types";
import { SagaContext } from "./SagaContext";
import { SagaOperator } from "./SagaOperator";


export class SagaEntrypoint {

    private operator?: SagaOperator;
    private context?: SagaContext;

    constructor(){}

    /**
     * Assign an instance of SagaOperator to route requests through and receive responses from response channels
     */
    useOperator(operator: SagaOperator) {
        this.operator = operator
        return this
    }

    /**
     * A set of input/output queues to operate within duriing task execution. Should not be the same context used in multi-step Saga runners
     */
    useContext(context: SagaContext) {

        this.context = context;
        return this;

    }

    /**
     * Run a task within current context
     */
    async run<
        RequestDataType extends DefaultSagaRequestType,
        ResponseDataType extends DefaultSagaResponseType,
        ErrorType extends DefaultSagaResponseType
    >(
        request_data: RequestDataType
    ){

        if(!this.operator) throw new Error('Saga operator not specified')
        if(!this.context) throw new Error('Saga context not specified')

        return await this.operator.executeTask<RequestDataType, ResponseDataType, ErrorType>(this.context, request_data)

    }

}