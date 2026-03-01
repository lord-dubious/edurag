import { Suspense } from 'react';
import { SignInForm } from './SignInForm';

export default function SignInPage() {
  const hasGoogle = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const hasMicrosoft = !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.MICROSOFT_TENANT_ID);

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SignInForm hasGoogle={hasGoogle} hasMicrosoft={hasMicrosoft} />
    </Suspense>
  );
}
