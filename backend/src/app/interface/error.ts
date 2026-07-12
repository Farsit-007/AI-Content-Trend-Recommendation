export type TErrorSecure = {
    path: string | number
    message: string
}[]

export type TGenericErrorResponse = {
    statusCode: number
    message: string
    errorSource: TErrorSecure
}
