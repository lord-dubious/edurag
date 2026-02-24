import { createUploadthing, type FileRouter } from 'uploadthing/next';
import { UploadThingError } from 'uploadthing/server';

const f = createUploadthing();

export const uploadRouter = {
  logoUploader: f({
    image: {
      maxFileSize: '4MB',
      maxFileCount: 1,
    },
  })
    .middleware(async () => {
      return { uploadedAt: Date.now() };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log('[UploadThing] Logo upload complete:', file.ufsUrl);
      return { url: file.ufsUrl, uploadedAt: metadata.uploadedAt };
    }),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;
