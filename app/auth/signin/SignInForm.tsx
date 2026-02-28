'use client';

import { useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
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
      const result = await signIn('credentials', {
        email: loginEmail,
        password: loginPassword,
        callbackUrl,
        redirect: false,
      });

      if (!result?.ok) {
        setError('Invalid email or password.');
        return;
      }

      window.location.href = result.url || callbackUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during sign in.');
    } finally {
      setIsLoading(false);
    }
  }, [callbackUrl, loginEmail, loginPassword]);


  const renderSocialButtons = () => {
    if (!hasGoogle && !hasMicrosoft) {
      return null;
    }

    return (
      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
        {hasGoogle && (
          <Button type='button' variant='outline' onClick={() => signIn('google', { callbackUrl })}>
            Continue with Google
          </Button>
        )}
        {hasMicrosoft && (
          <Button type='button' variant='outline' onClick={() => signIn('microsoft-entra-id', { callbackUrl })}>
            Continue with Outlook
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
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: registerName,
          email: registerEmail,
          password: registerPassword,
        }),
      });

      if (!res.ok) {
        try {
          const errorData = await res.json();
          setError(errorData.error || 'Unable to create account. Please try another email.');
        } catch {
          setError('Unable to create account. Please try another email.');
        }
        return;
      }

      const loginResult = await signIn('credentials', {
        email: registerEmail,
        password: registerPassword,
        callbackUrl,
        redirect: false,
      });

      if (!loginResult?.ok) {
        setError('Account created, but sign-in failed. Please sign in manually.');
        return;
      }

      window.location.href = loginResult.url || callbackUrl;
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
