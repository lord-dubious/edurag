'use client';

import { useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client-better';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface SignInFormProps {
  hasGoogle: boolean;
  hasMicrosoft: boolean;
}

export function SignInForm({ hasGoogle, hasMicrosoft }: SignInFormProps) {
  const params = useSearchParams();
  const rawCallbackUrl = params.get('callbackUrl');
  let callbackUrl = rawCallbackUrl || '/';
  if (!callbackUrl.startsWith('/') || callbackUrl.startsWith('//') || callbackUrl.includes('://')) {
    callbackUrl = '/';
  }
  const defaultTab = params.get('tab') === 'register' ? 'register' : 'signin';
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCredentialsLogin = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const result = await authClient.signIn.email({
        email: loginEmail,
        password: loginPassword,
        callbackURL: callbackUrl,
      });

      if (result.error) {
        setError('Invalid email or password.');
        return;
      }

      window.location.href = callbackUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during sign in.');
    } finally {
      setIsLoading(false);
    }
  }, [callbackUrl, loginEmail, loginPassword]);

  const handleSocialSignIn = useCallback(async (provider: 'google' | 'microsoft'): Promise<void> => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await authClient.signIn.social({ provider, callbackURL: callbackUrl });
      if (result.error) {
        setError(result.error.message ?? `Failed to sign in with ${provider}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `An error occurred during ${provider} sign in.`);
    } finally {
      setIsLoading(false);
    }
  }, [callbackUrl]);

  const renderSocialButtons = () => {
    if (!hasGoogle && !hasMicrosoft) {
      return null;
    }

    return (
      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
        {hasGoogle && (
          <Button
            type='button'
            variant='outline'
            onClick={() => handleSocialSignIn('google')}
            disabled={isLoading}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5 mr-2">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              <path d="M1 1h22v22H1z" fill="none"/>
            </svg>
            Continue with Google
          </Button>
        )}
        {hasMicrosoft && (
          <Button
            type='button'
            variant='outline'
            onClick={() => handleSocialSignIn('microsoft')}
            disabled={isLoading}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" className="w-5 h-5 mr-2">
              <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
              <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
              <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
            </svg>
            Continue with Microsoft
          </Button>
        )}
      </div>
    );
  };

  const handleRegister = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await authClient.signUp.email({
        name: registerName,
        email: registerEmail,
        password: registerPassword,
        callbackURL: callbackUrl,
      });

      if (result.error) {
        setError(result.error.message ?? 'Unable to create account. Please try another email.');
        return;
      }

      window.location.href = callbackUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during registration.');
    } finally {
      setIsLoading(false);
    }
  }, [callbackUrl, registerEmail, registerName, registerPassword]);

  return (
    <main className='min-h-screen flex items-center justify-center p-4'>
      <Card className='w-full max-w-md'>
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>Sign in or create an account to sync your chat history.</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <Tabs defaultValue={defaultTab}>
            <TabsList className='grid w-full grid-cols-2'>
              <TabsTrigger value='signin'>Sign in</TabsTrigger>
              <TabsTrigger value='register'>Create account</TabsTrigger>
            </TabsList>

            <TabsContent value='signin'>
              <form className='space-y-3' onSubmit={handleCredentialsLogin}>
                {renderSocialButtons()}
                <div className='space-y-1'>
                  <Label htmlFor='login-email'>Email</Label>
                  <Input id='login-email' type='email' value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required />
                </div>
                <div className='space-y-1'>
                  <Label htmlFor='login-password'>Password</Label>
                  <Input id='login-password' type='password' value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required />
                </div>
                <Button type='submit' className='w-full' disabled={isLoading}>
                  {isLoading ? 'Signing in...' : 'Sign in'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value='register'>
              <form className='space-y-3' onSubmit={handleRegister}>
                {renderSocialButtons()}
                <div className='space-y-1'>
                  <Label htmlFor='register-name'>Name</Label>
                  <Input id='register-name' value={registerName} onChange={e => setRegisterName(e.target.value)} required minLength={2} />
                </div>
                <div className='space-y-1'>
                  <Label htmlFor='register-email'>Email</Label>
                  <Input id='register-email' type='email' value={registerEmail} onChange={e => setRegisterEmail(e.target.value)} required />
                </div>
                <div className='space-y-1'>
                  <Label htmlFor='register-password'>Password</Label>
                  <Input id='register-password' type='password' value={registerPassword} onChange={e => setRegisterPassword(e.target.value)} required minLength={8} />
                </div>
                <Button type='submit' className='w-full' disabled={isLoading}>
                  {isLoading ? 'Creating account...' : 'Create account'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {error && <p className='text-sm text-destructive'>{error}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
