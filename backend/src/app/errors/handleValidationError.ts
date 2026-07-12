import mongoose from 'mongoose'
import { TErrorSecure, TGenericErrorResponse } from '../interface/error'

const handleValidationError = (
    err: mongoose.Error.ValidationError
): TGenericErrorResponse => {
    const errorSource: TErrorSecure = Object.values(err.errors).map(
        (val: mongoose.Error.ValidatorError | mongoose.Error.CastError) => {
            return {
                path: val?.path,
                message: val?.message,
            }
        }
    )

    const statusCode = 400
    return {
        statusCode,
        message: 'Validation Error',
        errorSource,
    }
}

export default handleValidationError
