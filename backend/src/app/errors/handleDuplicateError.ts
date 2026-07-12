/* eslint-disable @typescript-eslint/no-explicit-any */
import { TErrorSecure, TGenericErrorResponse } from '../interface/error'

const handleDuplicateError = (err: any): TGenericErrorResponse => {
    const match = err.message.match(/"([^"]*)"/)
    const extractedMessage = match && match[1]
    const errorSource: TErrorSecure = [
        {
            path: '',
            message: `${extractedMessage} is already exists`,
        },
    ]
    const statusCode = 400
    return {
        statusCode,
        message: 'Invalid Id',
        errorSource,
    }
}

export default handleDuplicateError
