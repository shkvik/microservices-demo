import { Subject } from "rxjs";
import { DefaultSagaResponseType } from "../../types/Saga.types";
import { SagaResponseChannelAdapter } from "../../types/SagaResponseChannelAdapter.types";


export class StubSagaResponseChannelAdapter
implements SagaResponseChannelAdapter {

    private static responseChannels: {[requestId: string]: Subject<DefaultSagaResponseType>} = {}
    private static errorChannels: {[requestId: string]: Subject<{ response: DefaultSagaResponseType, error: Error }>} = {}

    constructor(){}

    setupCredentials(credentials: {}): {} {
        return credentials
    }

    async connection(): Promise<void> {
        return;
    }

    async publishResponse<SagaResponse extends DefaultSagaResponseType>(response: SagaResponse): Promise<void> {
        if(!StubSagaResponseChannelAdapter.responseChannels[response.request_id])
            StubSagaResponseChannelAdapter.responseChannels[response.request_id] = new Subject()
        
        StubSagaResponseChannelAdapter.responseChannels[response.request_id].next(response)
    }
    
    async publishError<SagaErrorResponseType extends DefaultSagaResponseType>(
        response: SagaErrorResponseType,
        error: Error
    ): Promise<void> {
        if(!StubSagaResponseChannelAdapter.errorChannels[response.request_id])
            StubSagaResponseChannelAdapter.errorChannels[response.request_id] = new Subject()
        
        StubSagaResponseChannelAdapter.errorChannels[response.request_id].next({ response, error })
    }

    async subscribeToResponse<SagaResponse extends DefaultSagaResponseType>(
        request_id: string,
        callback: (response: SagaResponse) => Promise<void>
    ): Promise<void> {

        if(!StubSagaResponseChannelAdapter.responseChannels[request_id])
            StubSagaResponseChannelAdapter.responseChannels[request_id] = new Subject()
        
        const pulled = await new Promise<SagaResponse>((resolve) => {

            const sub = StubSagaResponseChannelAdapter.responseChannels[request_id]
            .subscribe((response) => {

                sub.unsubscribe()
                resolve(response as unknown as SagaResponse)

            })

        })

        await callback(pulled)

    }

    async subscribeToError<SagaErrorResponseType extends DefaultSagaResponseType>(
        request_id: string,
        callback: (letter: SagaErrorResponseType, error: Error) => Promise<void>
    ): Promise<void> {
        
        if(!StubSagaResponseChannelAdapter.errorChannels[request_id])
            StubSagaResponseChannelAdapter.errorChannels[request_id] = new Subject()

        const { response, error } = await new Promise<{ response: SagaErrorResponseType, error: Error }>((resolve) => {

            const sub = StubSagaResponseChannelAdapter.errorChannels[request_id]
            .subscribe((errorMessage) => {

                const { response, error } = errorMessage as
                    { response: SagaErrorResponseType, error: Error }

                sub.unsubscribe()
                resolve({ response, error })

            })

        })

        await callback(response, error)

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

    async dispose(): Promise<void> {
        StubSagaResponseChannelAdapter.flush()
    }

}