import { DefaultSagaRequestType, DefaultSagaResponseType } from "../types/Saga.types";
import { SagaContext } from "./SagaContext";
import { SagaOperator } from "./SagaOperator";


export class SagaEntrypoint {

    private operator?: SagaOperator;
    private context?: SagaContext;

    constructor(){}

    useOperator(operator: SagaOperator) {
        this.operator = operator
        return this
    }

    useContext(context: SagaContext) {

        this.context = context;
        return this;

    }

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