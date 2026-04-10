import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function AuthCodeError() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Authentication Error</CardTitle>
            <CardDescription>
              There was an error during the authentication process.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                The authentication process could not be completed. This might be due to:
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                <li>• An expired or invalid authentication code</li>
                <li>• A configuration issue with the OAuth provider</li>
                <li>• Network connectivity problems</li>
              </ul>
              <Button asChild className="w-full">
                <Link href="/auth/login">
                  Try Again
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 