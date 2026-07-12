import { z } from "zod";
import { Role } from "./user.constant";

export const userValidationSchema = z.object({
  body: z.object({
    name: z.string({ required_error: 'Please provide a Name' }),
   phone: z
      .string({ required_error: 'Phone is required' })
      .min(11, { message: 'Phone must be exactly 11 digits' })
      .max(11, { message: 'Phone must be exactly 11 digits' }),
    email: z
      .string({ required_error: 'Please provide a Email' })
      .email('Please provide a valid Email'),
    password: z.string({ required_error: 'Please provide a password' }).optional(),
    role: z.enum([...Role] as [string, ...string[]]),
  }),
});

export const updateUserValidationSchema = z.object({
  body: z.object({
    role: z.enum([...Role] as [string, ...string[]]).optional(),
    isBlock: z.boolean({ required_error: 'Please provide a value' }).optional(),
  }),
});