import AppError from '../../errors/AppError';
import { generateEmailHtml, sendEmail } from '../../utils/EmailSender';
import { httpStatus } from '../../utils/httpStatus';
import { USER_ROLE } from './user.constant';
import { TUser } from './user.interface';
import { User } from './user.model';
import { randomBytes } from 'crypto';

const generatePassword = (length = 8) => {
  return randomBytes(length)
    .toString('base64') 
    .replace(/[^a-zA-Z0-9]/g, '') 
    .slice(0, length);
};
const createUser = async (payload: TUser) => {
  if (!payload.password) {
    payload.password = generatePassword();
  }

  const result = await User.create(payload);
  if (result._id) {
    try {
      const html = generateEmailHtml(payload.password, result.email);
      await sendEmail(result.email, html);
  
    } catch (emailErr) {
      console.warn('Email sending failed, but user was created:', emailErr);
    }
  }
  return result;
};

const getAllUser = async () => {
  const result = await User.find({ role: { $ne: USER_ROLE.SUPER_ADMIN } });
  return result;
};
const updateUserFromDB = async (userId: string, payload: Partial<TUser>) => {
  const isUserExists = await User.findById(userId);
  if (!isUserExists) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }
  const result = await User.findByIdAndUpdate(userId, payload, {
    new: true,
  });
  return result;
};

const deleteUserFromDB = async (userId: string) => {
  const isUserExists = await User.findById(userId);
  if (!isUserExists) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }
  const result = await User.findByIdAndDelete(userId);
  return result;
};

export const UserServices = {
  createUser,
  getAllUser,
  updateUserFromDB,
  deleteUserFromDB,
};
