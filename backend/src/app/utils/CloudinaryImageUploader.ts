import { UploadApiResponse, v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { Readable } from 'stream';
import config from '../config';

// Configure Cloudinary
cloudinary.config({
  cloud_name: config.cloudinary_cloud_name,
  api_key: config.cloudinary_api_key,
  api_secret: config.cloudinary_api_secret,
});

export const sendImageToCloudinary = (
  imageName: string,
  buffer: Buffer
): Promise<Record<string, unknown>> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { public_id: imageName.trim() },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result as UploadApiResponse);
        }
      }
    );

    const readableStream = new Readable();
    readableStream.push(buffer);
    readableStream.push(null);
    readableStream.pipe(uploadStream);
  });
};

const storage = multer.memoryStorage();

export const uploadFile = multer({ storage: storage });
