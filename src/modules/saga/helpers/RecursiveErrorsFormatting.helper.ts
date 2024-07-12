
type ErrorWithCause = { name: string, message: string, stack?: string, cause?: ErrorWithCause }

export const formatErrorRecursive = (error: Error) : ErrorWithCause => {

    let cause = error.cause

    // resolve circular assignment
    while(cause === error) cause = (cause as Error).cause

    return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        cause: cause ? formatErrorRecursive(cause as Error) : undefined
    }

}