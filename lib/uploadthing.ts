import { createUploadthing, type FileRouter } from 'uploadthing/next';

const f = createUploadthing();

export const uploadRouter = {
  logoUploader: f({
    image: {
      maxFileSize: '4MB',
      maxFileCount: 1,
    },
  })
    .middleware(() => ({ uploadedAt: Date.now() }))
    .onUploadComplete(({ metadata, file }) => {
      console.log('[UploadThing] Logo upload complete:', file.ufsUrl);
      return { url: file.ufsUrl, uploadedAt: metadata.uploadedAt };
    }),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;
