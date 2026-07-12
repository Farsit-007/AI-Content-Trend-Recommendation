import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join((process.cwd(), '.env')) });
export default {
  port:  process.env.PORT,
  database_url: process.env.DATABASE_URL,
  jwt_access_secret : process.env.JWT_ACCESS_SECRET,
  jwt_refresh_secret : process.env.JWT_REFRESH_SECRET,
  NODE_ENV: process.env.NODE_ENV,
  cloudinary_cloud_name : process.env.CLOUDINARY_CLOUD_NAME,
  cloudinary_api_key : process.env.CLOUDINARY_API_KEY,
  cloudinary_api_secret:process.env.CLOUDINARY_API_SECRET,
  smtp_email : process.env.SMTP_EMAIL,
  smtp_password : process.env.SMTP_PASSWORD,
  web_url : process.env.WEB_URL,
}