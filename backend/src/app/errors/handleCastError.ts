import mongoose from 'mongoose'
import { TErrorSecure, TGenericErrorResponse } from '../interface/error'


const handleCastError = (
    err: mongoose.Error.CastError
): TGenericErrorResponse => {
    const errorSource: TErrorSecure = [
        {
            path: err.path,
            message: err.message,
        },
    ]
    const statusCode = 400
    return {
        statusCode,
        message: 'Invalid Id',
        errorSource,
    }
}

export default handleCastError
