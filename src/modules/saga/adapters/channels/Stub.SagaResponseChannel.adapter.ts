import { Subject } from "rxjs";
import { DefaultSagaRequestType, DefaultSagaResponseType } from "../../types/Saga.types";
import { SagaResponseChannelAdapter } from "../../types/SagaResponseChannelAdapter.types";


export class StubSagaResponseChannelAdapter
implements SagaResponseChannelAdapter {

    private static responseChannels: {[requestId: string]: Subject<DefaultSagaResponseType>} = {}
    private static errorChannels: {[requestId: string]: Subject<DefaultSagaResponseType>} = {}

    constructor(){}

    setupCredentials(credentials: {}): {} {
        return credentials
    }

    async connection(): Promise<void> {
        return;
    }

    publishResponse<SagaResponse extends DefaultSagaResponseType>(response: SagaResponse): void {
        if(!StubSagaResponseChannelAdapter.responseChannels[response.request_id])
            StubSagaResponseChannelAdapter.responseChannels[response.request_id] = new Subject()
        
        StubSagaResponseChannelAdapter.responseChannels[response.request_id].next(response)
    }
    
    publishError<SagaError extends DefaultSagaResponseType>(error: SagaError): void {
        if(!StubSagaResponseChannelAdapter.errorChannels[error.request_id])
            StubSagaResponseChannelAdapter.errorChannels[error.request_id] = new Subject()
        
        StubSagaResponseChannelAdapter.errorChannels[error.request_id].next(error)
    }

    async subscribeToResponse<SagaResponse extends DefaultSagaRequestType>(request_id: string, callback: (response: SagaResponse) => void): Promise<SagaResponse> {

        if(!StubSagaResponseChannelAdapter.responseChannels[request_id])
            StubSagaResponseChannelAdapter.responseChannels[request_id] = new Subject()
        
        const pulled = await new Promise<SagaResponse>((resolve) => {

            const sub = StubSagaResponseChannelAdapter.responseChannels[request_id]
            .subscribe((response) => {

                sub.unsubscribe()
                resolve(response as unknown as SagaResponse)

            })

        })

        callback(pulled)

        return pulled

    }

    async subscribeToError<SagaError extends DefaultSagaResponseType>(request_id: string, callback: (error: SagaError) => void): Promise<SagaError> {
        
        if(!StubSagaResponseChannelAdapter.errorChannels[request_id])
            StubSagaResponseChannelAdapter.errorChannels[request_id] = new Subject()

        const error = await new Promise<SagaError>((resolve) => {

            const sub = StubSagaResponseChannelAdapter.errorChannels[request_id]
            .subscribe((response) => {

                sub.unsubscribe()
                resolve(response as unknown as SagaError)

            })

        })

        callback(error)

        return error

    }

    async disposeSubscriptions(request_id: string): Promise<void> {
        
        if(StubSagaResponseChannelAdapter.responseChannels[request_id]) {

            StubSagaResponseChannelAdapter.responseChannels[request_id].complete()
            delete StubSagaResponseChannelAdapter.responseChannels[request_id]
            
        }

        if(StubSagaResponseChannelAdapter.errorChannels[request_id]) {

            StubSagaResponseChannelAdapter.errorChannels[request_id].complete()
            delete StubSagaResponseChannelAdapter.errorChannels[request_id]
            
        }

    }

    static flush() {

        Object.keys(StubSagaResponseChannelAdapter.responseChannels)
            .map(key => {
                StubSagaResponseChannelAdapter.responseChannels[key].complete()
                delete StubSagaResponseChannelAdapter.responseChannels[key]
        })

        Object.keys(StubSagaResponseChannelAdapter.errorChannels)
            .map(key => {
                StubSagaResponseChannelAdapter.errorChannels[key].complete()
                delete StubSagaResponseChannelAdapter.errorChannels[key]
            })

    }

}