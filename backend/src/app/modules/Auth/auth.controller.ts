import config from "../../config"
import { catchAsync } from "../../utils/catchAsync"
import { httpStatus } from "../../utils/httpStatus"
import sendResponse from "../../utils/sendResponse"
import { AuthServices } from "./auth.service"

const loginUser = catchAsync(async (req, res) => {
    const result = await AuthServices.loginUserIntoDB(req.body)
    const { refreshToken, token } = result
    res.cookie('refreshToken', refreshToken, {
        secure: config.NODE_ENV === 'production',
        httpOnly: true,
    })
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'User logged in successfully',
        data: {
            token,
            refreshToken
        },
    })
})

const changePassword = catchAsync(async (req, res) => {
    const { ...passwordData } = req.body
    const result = await AuthServices.changePasswordIntoDB(
        req.user,
        passwordData
    )
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Password updated successfully',
        data: null,
    })
})

const refreshToken = catchAsync(async (req, res) => {
    const { refreshToken } = req.cookies
    const result = await AuthServices.refreshToken(refreshToken)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Token is retrieved successfully',
        data: result,
    })
})

export const AuthController = {
    loginUser,
    changePassword,
    refreshToken
}
