import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { UserServices } from './user.service';

const createUser = catchAsync(async (req, res) => {
  const result = await UserServices.createUser(req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'User registered successfully',
    data: result,
  });
});

const getAllUser = catchAsync(async (req, res) => {
  const result = await UserServices.getAllUser();
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'User retrived successfully',
    data: result,
  });
});

const updateUserRole = catchAsync(async (req, res) => {
  const id = req.params.id;
  const result = await UserServices.updateUserFromDB(id, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User updated successfully',
    data: result,
  });
});

const deleteUser = catchAsync(async (req, res) => {
  const id = req.params.id;
  const result = await UserServices.deleteUserFromDB(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User Deleted successfully',
    data: [],
  });
});

export const UserController = {
  createUser,
  getAllUser,
  updateUserRole,
  deleteUser,
};
