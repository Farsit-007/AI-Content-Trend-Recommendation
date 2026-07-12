import jwt, { SignOptions } from 'jsonwebtoken';
export const createToken = (
  jwtPayload: { userEmail: string; role: string; name: string },
  secret: string,
  expiresIn: string | number,
) => {
  return jwt.sign(jwtPayload, secret, { expiresIn } as SignOptions);
};
