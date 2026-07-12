import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { notFound } from './app/middleware/notFound';
import cookieParser from 'cookie-parser';
import { globalErrorHandler } from './app/middleware/globalErrorHandler';
import router from './app/routes';
const app: Application = express();

app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: [''],
    credentials: true,
  }),
);
app.use('/api/v1', router);
app.get('/', (req: Request, res: Response) => {
  res.send(`Server is running.`);
});

app.use(globalErrorHandler);
app.use(notFound);

export default app;
